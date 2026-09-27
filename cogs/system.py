import datetime
import time
from collections import deque

import discord
from discord.ext import commands, tasks

from core.config import IMAKITA_RATE_LIMIT_COUNT, IMAKITA_RATE_LIMIT_SECONDS, JST
from core.state import state
from data.points_manager import points_manager
from data.settings_manager import settings_manager
from services.ai.deepseek import generate_deepseek_text_response
from ui.embeds import create_embed
from ui.views_system import HelpView, ImakitaDetailView


def is_owner_or_admin():
    async def predicate(ctx):
        return ctx.author.id == 1102557945889300480 or ctx.author.guild_permissions.administrator
    return commands.check(predicate)


class System(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.imakita_request_timestamps = deque()
        self.imakita_cache = {}
        self.imakita_detail_cache = {}
        if not self.wealth_tax.is_running():
            self.wealth_tax.start()
        if not self.cleanup_finished_games.is_running():
            self.cleanup_finished_games.start()

    def cog_unload(self):
        self.wealth_tax.cancel()
        self.cleanup_finished_games.cancel()

    @tasks.loop(minutes=5)
    async def cleanup_finished_games(self):
        current_time_jst = datetime.datetime.now(JST)

        expired_othello_ids = []
        for message_id, session in list(state.active_games.items()):
            game = session.get("game")
            if game and game.game_over and current_time_jst - game.last_move_time > datetime.timedelta(hours=1):
                expired_othello_ids.append(message_id)
                if game.afk_task and not game.afk_task.done():
                    game.afk_task.cancel()
        for message_id in expired_othello_ids:
            state.active_games.pop(message_id, None)

        expired_janken_ids = []
        for message_id, game_data in list(state.active_janken_games.items()):
            try:
                message = game_data.get("message")
                if message and current_time_jst - message.created_at.astimezone(JST) > datetime.timedelta(minutes=30) and game_data.get("game_status") != "finished":
                    expired_janken_ids.append(message_id)
            except Exception as error:
                print(f"Janken cleanup check failed for {message_id}: {error}")
        for message_id in expired_janken_ids:
            game_data = state.active_janken_games.pop(message_id, None)
            if not game_data:
                continue
            try:
                await game_data["message"].edit(
                    embed=create_embed("じゃんけん", "このじゃんけんゲームは時間切れにより終了しました。", discord.Color.orange(), "warning"),
                    view=None,
                )
            except Exception as error:
                print(f"Janken cleanup failed for {message_id}: {error}")

    @cleanup_finished_games.before_loop
    async def before_cleanup_finished_games(self):
        await self.bot.wait_until_ready()

    @tasks.loop(hours=24)
    async def wealth_tax(self):
        if datetime.datetime.now(JST).hour != 5:
            return
        updates = {}
        for user_id, points in points_manager.game_points.copy().items():
            try:
                if int(user_id) == self.bot.user.id:
                    continue
            except ValueError:
                continue
            tax = -50 if points >= 3000 else -10 if points >= 500 else -5 if points >= 100 else 0
            if tax:
                updates[user_id] = max(0, points + tax)
        if updates:
            points_manager.game_points.update(updates)
            points_manager.save_all()

    @wealth_tax.before_loop
    async def before_wealth_tax(self):
        await self.bot.wait_until_ready()

    @commands.command()
    @commands.guild_only()
    @is_owner_or_admin()
    async def sync(self, ctx, guild_id: int = None):
        guild = discord.Object(id=guild_id) if guild_id else ctx.guild
        self.bot.tree.copy_global_to(guild=guild)
        try:
            synced = await self.bot.tree.sync(guild=guild)
            await ctx.send(f"`{len(synced)}`個のスラッシュコマンドをこのサーバーに同期しました。")
        except discord.Forbidden as error:
            await ctx.send(f"エラー: Botがこのサーバーでスラッシュコマンドを作成する権限を持っていません。\n`{error}`")
        except Exception as error:
            await ctx.send(f"同期中に予期せぬエラーが発生しました。\n`{error}`")

    @commands.command(name="help", aliases=["へるぷ", "ヘルプ"])
    @commands.cooldown(1, 5, commands.BucketType.user)
    async def help_command(self, ctx):
        view = HelpView()
        view.message = await ctx.send(embed=create_embed("ヘルプ", "下のボタンを押してコマンド一覧を表示します。", discord.Color(0x3498DB), "info"), view=view)

    @help_command.error
    async def help_command_error(self, ctx, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.send(embed=create_embed("クールダウン中", f"このコマンドはあと {error.retry_after:.1f}秒 後に利用できます。", discord.Color.orange(), "pending"), delete_after=5)

    @commands.command(name="setchannel")
    @commands.has_permissions(administrator=True)
    @commands.cooldown(1, 5, commands.BucketType.guild)
    async def setchannel(self, ctx):
        channel_id = ctx.channel.id
        if channel_id in state.allowed_channels:
            state.allowed_channels.remove(channel_id)
            description, color, status = f"このチャンネル <#{channel_id}> でのコマンド利用を**禁止**しました。", discord.Color.red(), "danger"
        else:
            state.allowed_channels.add(channel_id)
            description, color, status = f"このチャンネル <#{channel_id}> でのコマンド利用を**許可**しました。", discord.Color.green(), "success"
        settings_manager.save_settings()
        await ctx.send(embed=create_embed("設定変更完了", description, color, status))

    @setchannel.error
    async def setchannel_error(self, ctx, error):
        if isinstance(error, commands.MissingPermissions):
            await ctx.send(embed=create_embed("権限エラー", "このコマンドを実行するには管理者権限が必要です。", discord.Color.red(), "danger"))

    @discord.app_commands.command(name="imakita", description="過去30分のチャットを3行で要約します。")
    async def imakita_slash(self, interaction: discord.Interaction):
        current_time, channel_id = time.time(), interaction.channel_id
        cached = self.imakita_cache.get(channel_id)
        if cached and current_time - cached["timestamp"] < 120:
            view = ImakitaDetailView(interaction, self.bot, self.imakita_detail_cache)
            await interaction.response.send_message(embed=create_embed("今北産業（過去30分）", cached["summary"], discord.Color.green(), "success", "DeepSeek"), view=view, ephemeral=True)
            view.message = await interaction.original_response()
            return
        while self.imakita_request_timestamps and self.imakita_request_timestamps[0] < current_time - IMAKITA_RATE_LIMIT_SECONDS:
            self.imakita_request_timestamps.popleft()
        if len(self.imakita_request_timestamps) >= IMAKITA_RATE_LIMIT_COUNT:
            wait = int(IMAKITA_RATE_LIMIT_SECONDS - (current_time - self.imakita_request_timestamps[0]))
            await interaction.response.send_message(f"APIリクエストが集中しています。しばらくお待ちください。(あと約 {wait}秒)", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True, thinking=True)
        self.imakita_request_timestamps.append(current_time)
        if not hasattr(interaction.channel, "history"):
            await interaction.followup.send("このチャンネルではメッセージ履歴を取得できません。", ephemeral=True)
            return
        history = [
            f"<@{message.author.id}>: {message.clean_content}"
            async for message in interaction.channel.history(limit=200, after=discord.utils.utcnow() - datetime.timedelta(minutes=30))
            if message.author != self.bot.user and not message.author.bot and message.clean_content
        ]
        if not history:
            await interaction.followup.send("過去30分にメッセージはありませんでした。", ephemeral=True)
            return
        prompt = "以下のDiscordのチャット履歴を、重要な点を3つの短い箇条書きで要約してください。ユーザー名は<@ユーザーID>の形式になっています。そのまま出力に含めてください。「以下に要約します」のような前置きは不要です。\n\n--- 履歴 ---\n" + "\n".join(reversed(history))
        summary = await generate_deepseek_text_response(prompt)
        if summary.startswith("Error:") or summary.startswith("DeepSeek"):
            await interaction.followup.send(embed=create_embed("要約エラー", summary, discord.Color.red(), "danger", "DeepSeek"), ephemeral=True)
            return
        self.imakita_cache[channel_id] = {"timestamp": current_time, "summary": summary}
        view = ImakitaDetailView(interaction, self.bot, self.imakita_detail_cache)
        await interaction.followup.send(embed=create_embed("今北産業（過去30分）", summary, discord.Color.green(), "success", "DeepSeek"), view=view, ephemeral=True)
        view.message = await interaction.original_response()


async def setup(bot):
    await bot.add_cog(System(bot))
