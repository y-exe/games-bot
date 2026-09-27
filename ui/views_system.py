import datetime
import os
import time

import discord

from core.config import DEEPSEEK_API_KEY, FONTS_DIR
from services.ai.deepseek import generate_deepseek_text_response
from ui.embeds import create_embed


class HelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=180.0)
        self.message = None

    @discord.ui.button(label="コマンド一覧を表示", style=discord.ButtonStyle.primary)
    async def show_commands_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        embed = create_embed("杉山啓太Bot コマンド一覧", "", discord.Color(0x3498DB), "info")
        commands_list = [
            ("`watermark` + [画像]", "画像にウォーターマークを合成します。"), ("`/imakita`", "過去30分のチャットを3行で要約します。(スラッシュコマンド)"),
            ("`5000 [上] [下]`", "「5000兆円欲しい！」画像を生成します。"), ("`gaming` + [画像]", "画像をゲーミング風GIFに変換します。"),
            ("`othello (@相手)`", "オセロをプレイします。"), ("`janken`", "じゃんけんゲームを開始します。"),
            ("`bet [金額]`", "ポイントを賭けてダイスゲームに挑戦します。"), ("`text [文字]`", "やまかわサムネ風の黄色い文字画像を生成します。"),
            ("`text2 [文字]`", "やまかわサムネ風の青い文字画像を生成します。"), ("`text3 [文字]`", "Noto Serifフォントの赤い文字画像を生成します。"),
            ("`ping`", "Botの応答速度を表示します。"), ("`tenki [地名]`", "日本の都市の天気予報を表示します。"),
            ("`info (@相手)`", "ユーザー情報を表示します。"), ("`rate [金額] [通貨]`", "外貨を日本円に換算します。"),
            ("`shorturl [URL]`", "URLを短縮します。"), ("`amazon [URL]`", "AmazonのURLを短縮します。"),
            ("`totusi [文字列]`", "突然の死ジェネレーター。"), ("`time (国コード)`", "世界時計。"), ("`help`", "このヘルプを表示します。"),
        ]
        for name, description in commands_list:
            embed.add_field(name=name, value=description, inline=False)
        font_ok = "✅" if os.path.exists(os.path.join(FONTS_DIR, "MochiyPopOne-Regular.ttf")) else "❌"
        noto_ok = "✅" if os.path.exists(os.path.join(FONTS_DIR, "NotoSerifJP-Black.ttf")) else "❌"
        deepseek_ok = "✅" if DEEPSEEK_API_KEY else "❌"
        embed.add_field(name="API/Font Status", value=f"DeepSeek: {deepseek_ok} \nFont(Default): {font_ok} | Font(Noto): {noto_ok}", inline=False)
        await interaction.response.send_message(embed=embed, ephemeral=True)
        try:
            await interaction.message.delete()
        finally:
            self.stop()

    async def on_timeout(self):
        if self.message:
            for item in self.children:
                item.disabled = True
            try:
                await self.message.edit(view=self)
            except discord.HTTPException:
                pass


class ImakitaDetailView(discord.ui.View):
    def __init__(self, original_interaction: discord.Interaction, bot, detail_cache: dict):
        super().__init__(timeout=300.0)
        self.original_interaction, self.bot, self.detail_cache = original_interaction, bot, detail_cache
        self.last_pressed = 0.0
        self.message = None

    async def fetch_and_summarize(self, interaction, time_deltas, title):
        channel_id, current_time = self.original_interaction.channel_id, time.time()
        cached = self.detail_cache.get(channel_id)
        if cached and current_time - cached["timestamp"] < 120:
            await interaction.response.send_message(embed=create_embed(title, cached["summary"], discord.Color.blue(), "info", "DeepSeek"), ephemeral=True)
            return
        if current_time - self.last_pressed < 30:
            await interaction.response.send_message("現在読み込み中です。もう少々お待ちください。", ephemeral=True, delete_after=10)
            return
        self.last_pressed = current_time
        await interaction.response.defer(ephemeral=True)
        now, full_summary = discord.utils.utcnow(), ""
        for start_minutes, end_minutes in time_deltas:
            history = [
                f"<@{message.author.id}>: {message.clean_content}"
                async for message in self.original_interaction.channel.history(limit=200, before=now - datetime.timedelta(minutes=end_minutes), after=now - datetime.timedelta(minutes=start_minutes))
                if message.author != self.bot.user and not message.author.bot and message.clean_content
            ]
            if not history:
                continue
            prompt = "以下のDiscordのチャット履歴を、重要な点を【最大3つ】の短い箇条書きで要約してください。ユーザー名は<@ユーザーID>の形式になっています。そのまま出力に含めてください。「以下に要約します」のような前置きは絶対に含めないでください。\n\n--- 履歴 ---\n" + "\n".join(reversed(history))
            summary = await generate_deepseek_text_response(prompt)
            if not summary.startswith("Error:") and not summary.startswith("DeepSeek"):
                full_summary += f"### {start_minutes}～{end_minutes}分前\n{summary}\n\n"
        full_summary = full_summary or "詳細な要約を生成できるメッセージがありませんでした。"
        self.detail_cache[channel_id] = {"timestamp": current_time, "summary": full_summary}
        await interaction.followup.send(embed=create_embed(title, full_summary, discord.Color.blue(), "info", "DeepSeek"), ephemeral=True)

    @discord.ui.button(label="さらに詳しく", style=discord.ButtonStyle.primary)
    async def detail_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.fetch_and_summarize(interaction, [(30, 15), (15, 10), (10, 5), (5, 0)], "詳細な要約（過去30分）")
        button.disabled = True
        if self.message:
            await self.message.edit(view=self)
