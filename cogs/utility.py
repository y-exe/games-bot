# cogs/utility.py
import discord
from discord.ext import commands
import datetime
import pytz
import math
import unicodedata
import aiohttp
from core.config import JST, EXCHANGE_RATE_API_URL
from core.constants import USER_BADGES_EMOJI, TIMEZONE_MAP, STATUS_EMOJIS
from core.state import state
from ui.embeds import create_embed
from services.network.weather_api import get_weather_forecast, get_city_id_fuzzy
from ui.views_utility import TimeHelpView

class Utility(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name="rate", aliases=["レート", "れーと", "為替"])
    @commands.cooldown(1, 5, commands.BucketType.user)
    async def rate(self, ctx, amount_str: str, currency_code: str):
        try:
            amount = float(amount_str)
        except ValueError:
            return await ctx.send(embed=create_embed("入力エラー", "金額は有効な数値で入力してください。", discord.Color.orange(), "warning"))
        
        async with ctx.typing():
            try:
                async with aiohttp.ClientSession() as s:
                    async with s.get(EXCHANGE_RATE_API_URL) as r:
                        if r.status == 200:
                            data = await r.json()
                            target_key = f"{currency_code.upper()}_JPY"
                            if target_key in data:
                                rate_val = data[target_key]
                                jpy_val = amount * rate_val
                                time_str = data.get('datetime', '')
                                try:
                                    dt = datetime.datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                                    time_disp = dt.astimezone(JST).strftime('%Y-%m-%d %H:%M') + " JST"
                                except: time_disp = "不明"
                                
                                desc = f"**{amount:,.2f} {currency_code.upper()}** は **{jpy_val:,.2f} 円**です。\n(レート: 1 {currency_code.upper()} = {rate_val:,.3f} JPY | {time_disp}時点)"
                                await ctx.send(embed=create_embed("為替レート変換", desc, discord.Color.gold(), "success", "exchange-rate-api.krnk.org"))
                            else:
                                await ctx.send(embed=create_embed("エラー", f"通貨「{currency_code.upper()}」は見つかりません。", discord.Color.orange(), "warning"))
                        else:
                            await ctx.send(embed=create_embed("APIエラー", f"HTTP {r.status}", discord.Color.red(), "danger"))
            except Exception as e:
                await ctx.send(f"エラー: {e}")

    @rate.error
    async def rate_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "金額と通貨コードを指定してください。\n例: `rate 100 USD`", discord.Color.orange(), "warning"))

    @commands.command(name="tenki", aliases=["weather", "てんき", "天気", "テンキ"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def tenki(self, ctx, *, city_name_query: str):
        async with ctx.typing():
            city_id = await get_city_id_fuzzy(city_name_query, state.weather_city_id_map)
            if not city_id:
                return await ctx.send(embed=create_embed("エラー", f"都市「{city_name_query}」が見つかりませんでした。", discord.Color.orange(), "warning"))

            data = await get_weather_forecast(city_id)
            if not data or data.get("error"):
                return await ctx.send(embed=create_embed("APIエラー", "天気情報の取得に失敗しました。", discord.Color.red(), "danger"))

            if data.get("forecasts"):
                loc = data.get('location', {}).get('city', city_name_query)
                embed = create_embed(f"{loc} の天気予報", "", discord.Color.blue(), "success", "つくもAPI")
                for f in data["forecasts"][:3]:
                    d_label = f.get('dateLabel', '')
                    d_str = f.get('date', '')[-5:]
                    max_t = f.get("temperature", {}).get("max", {}).get("celsius", "--")
                    min_t = f.get("temperature", {}).get("min", {}).get("celsius", "--")
                    embed.add_field(name=f"{d_label} ({d_str})", value=f"{f.get('telop')} (最高:{max_t}°C / 最低:{min_t}°C)", inline=False)
                await ctx.send(embed=embed)

    @tenki.error
    async def tenki_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "都市名を指定してください。\n例: `tenki 東京`", discord.Color.orange(), "warning"))

    @commands.command(name="totusi", aliases=["突然の死", "とつし", "突死"])
    @commands.cooldown(1, 3, commands.BucketType.user)
    async def totusi(self, ctx, *, text: str):
        clean = text.replace("　", " ")
        width = sum(2 if unicodedata.east_asian_width(c) in 'FWA' else 1 for c in clean)
        count = min(15, max(3, math.ceil(width / 1.5)))
        line1 = "＿" + "人" * count + "＿"
        line2 = f"＞　**{clean}**　＜"
        line3 = "￣" + ("Y^" * (count // 2)) + ("Y" if count % 2 else "") + ("^Y" * (count//2)) + "￣"
        await ctx.send(embed=create_embed("突然の死", f"{line1}\n{line2}\n{line3}", discord.Color.light_grey(), "success"))

    @totusi.error
    async def totusi_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "文字列を指定してください。\n例: `totusi すごい`", discord.Color.orange(), "warning"))

    @commands.command(name="info", aliases=["詳細", "いんふぉ"])
    @commands.cooldown(1, 5, commands.BucketType.user)
    async def info(self, ctx, member: discord.Member = None):
        target = member or ctx.author
        embed = create_embed(f"{target.display_name} の情報", "", target.color, "info")
        if target.avatar: embed.set_thumbnail(url=target.avatar.url)
        embed.add_field(name="ユーザー名", value=f"`{target.name}`", inline=True)
        embed.add_field(name="ユーザーID", value=f"`{target.id}`", inline=True)
        embed.add_field(name="Bot?", value="はい" if target.bot else "いいえ", inline=True)
        embed.add_field(name="アカウント作成日", value=f"<t:{int(target.created_at.timestamp())}:D>", inline=True)
        if isinstance(target, discord.Member):
            if target.joined_at:
                embed.add_field(name="サーバー参加日", value=f"<t:{int(target.joined_at.timestamp())}:R>", inline=True)
            
            badges = []
            if target.public_flags:
                for f, e in USER_BADGES_EMOJI.items():
                    if getattr(target.public_flags, f, False): badges.append(e)
            if target.premium_since: badges.append(USER_BADGES_EMOJI['booster'])
            if (target.avatar and target.avatar.is_animated()) or target.banner: badges.append(USER_BADGES_EMOJI['nitro'])
            
            if badges: embed.add_field(name="バッジ", value=" ".join(list(set(badges))), inline=False)
            
            roles = [r.mention for r in reversed(target.roles) if r.name != "@everyone"]
            if roles: embed.add_field(name=f"ロール ({len(roles)})", value=" ".join(roles)[:1000], inline=False)
        
        await ctx.send(embed=embed)

    @commands.command(name="time", aliases=["時間", "たいむ", "タイム", "じかん"])
    @commands.cooldown(1, 3, commands.BucketType.user)
    async def time(self, ctx, code: str = None):
        if not code:
            now = datetime.datetime.now(JST).strftime('%H:%M:%S')
            description = f"現在の日本時間は **{now}** です。\n\n{STATUS_EMOJIS['info']} 国コードを指定すると、その国の時刻を表示できます。(例: `time US`)"
            await ctx.send(embed=create_embed("現在時刻 (日本時間)", description, discord.Color.blue(), "info"), view=TimeHelpView())
            return
        
        tz = TIMEZONE_MAP.get(code.upper())
        if not tz:
            description = f"`{code}` は見つかりませんでした。\n利用可能な国コードの一覧は下のボタンから確認できます。"
            return await ctx.send(embed=create_embed("無効な国コード", description, discord.Color.orange(), "warning"), view=TimeHelpView())
        
        dt = datetime.datetime.now(pytz.timezone(tz))
        off = f"UTC{dt.utcoffset().total_seconds()/3600:+g}"
        city_name = tz.split('/')[-1].replace('_', ' ')
        await ctx.send(embed=create_embed(f"{city_name} の現在時刻", f"**{dt.strftime('%Y-%m-%d %H:%M:%S')}** ({off})", discord.Color.blue(), "success"))

    @commands.command(name="ping", aliases=["ピング", "接続速度", "ぴんぐ"])
    @commands.cooldown(1, 5, commands.BucketType.user)
    async def ping(self, ctx):
        await ctx.send(embed=create_embed("Ping", f"現在の応答速度: **{self.bot.latency * 1000:.2f}ms**", discord.Color.green(), "success"))

async def setup(bot):
    await bot.add_cog(Utility(bot))
