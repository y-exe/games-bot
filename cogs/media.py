# cogs/media.py
import discord
from discord.ext import commands
import io
import os
import random
import aiohttp
import urllib.parse
from PIL import Image
from core.config import FONTS_DIR, TEMPLATES_DIR
from core.constants import TEMPLATES_DATA, STATUS_EMOJIS
from services.image.base_worker import resize_if_too_large
from services.image.text_gen import generate_styled_text_image
from services.image.text_special import generate_text4_hd, generate_text5_gradient
from services.image.watermark import process_and_composite_image
from services.image.gaming_gif import create_gaming_gif
from services.image.choyen import get_5000choyen_url
from services.ai.voicevox import generate_voicevox_audio
from services.audio.rvc import convert_audio
from ui.embeds import create_embed

class Media(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def _send_img(self, ctx, img, title, filename="image.png"):
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        
        final_buf, resized = await resize_if_too_large(buf, "PNG")
        
        file = discord.File(final_buf, filename=filename)
        desc = f"{STATUS_EMOJIS['info']} 改行はコンマ`,`区切りで スタンプ化は `square` をつけてください"
        embed = create_embed(title, desc, status="success")
        embed.set_image(url=f"attachment://{filename}")
        
        await ctx.send(embed=embed, file=file)

    async def _process_text_command(self, ctx, args, title, color, normal_params, square_params, font_name):
        if not args:
            return await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

        is_square = args.lower().endswith(" square")
        clean_text = args[:-7].strip() if is_square else args.strip()
        
        if not clean_text:
            return await ctx.send(embed=create_embed("引数エラー", "画像にするテキスト内容が空です。", discord.Color.orange(), "warning"))
        
        font_path = os.path.join(FONTS_DIR, font_name)
        if not os.path.exists(font_path):
            return await ctx.send(embed=create_embed("内部エラー", f"フォントファイルが見つかりません: `{font_name}`", discord.Color.red(), "danger"))

        # モードに応じたパラメータを選択
        params = square_params if is_square else normal_params

        msg = await ctx.send(embed=create_embed("画像生成中...", "テキスト画像を生成しています...", discord.Color.blue(), "pending"))
        
        try:
            img = generate_styled_text_image(clean_text, font_path, params, is_square)
            
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            
            final_buf, resized = await resize_if_too_large(buf, "PNG")
            file = discord.File(final_buf, filename="text.png")
            
            embed = create_embed(title, f"{STATUS_EMOJIS['info']} 改行はコンマ`,`区切りで スタンプ化は `square` をつけてください", color, "success")
            embed.set_image(url="attachment://text.png")
            
            await msg.edit(content=None, embed=embed, attachments=[file])
        except Exception as e:
            await msg.edit(embed=create_embed("エラー", "画像生成中に予期せぬエラーが発生しました。", discord.Color.red(), "danger"))
            print(f"Text Gen Error: {e}")

    @commands.command(name="text", aliases=["テキスト"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def text1(self, ctx, *, args: str):
        # 通常設定
        n_params = {
            'text_color': (255, 255, 0), 'inner_color': (0, 0, 0), 'inner_thickness': 7,
            'outer_color': (255, 255, 255), 'outer_thickness': 5, 'spacing': 0
        }
        # Square設定（太字・文字詰め）
        s_params = {
            'text_color': (255, 255, 0), 'inner_color': (0, 0, 0), 'inner_thickness': 15,
            'outer_color': (255, 255, 255), 'outer_thickness': 12, 'spacing': -17, 'padding': 15
        }
        await self._process_text_command(ctx, args, "やまかわサムネ風テキスト", discord.Color.yellow(), n_params, s_params, "MochiyPopOne-Regular.ttf")

    @text1.error
    async def text_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

    @commands.command(name="text2", aliases=["テキスト2"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def text2(self, ctx, *, args: str):
        n_params = {
            'text_color': (50, 150, 255), 'inner_color': (0, 0, 0), 'inner_thickness': 7,
            'outer_color': (255, 255, 255), 'outer_thickness': 5, 'spacing': 0
        }
        s_params = {
            'text_color': (50, 150, 255), 'inner_color': (0, 0, 0), 'inner_thickness': 15,
            'outer_color': (255, 255, 255), 'outer_thickness': 12, 'spacing': -17, 'padding': 15
        }
        await self._process_text_command(ctx, args, "やまかわ青文字テキスト", discord.Color.blue(), n_params, s_params, "MochiyPopOne-Regular.ttf")

    @text2.error
    async def text2_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

    @commands.command(name="text3", aliases=["テキスト3"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def text3(self, ctx, *, args: str):
        n_params = {
            'text_color': (0xC3, 0x02, 0x03), 'inner_color': (255, 255, 255), 'inner_thickness': 7,
            'spacing': 0
        }
        s_params = {
            'text_color': (0xC3, 0x02, 0x03), 'inner_color': (255, 255, 255), 'inner_thickness': 15,
            'spacing': -17, 'padding': 15
        }
        await self._process_text_command(ctx, args, "やまかわ赤文字テキスト", discord.Color.from_rgb(0xC3, 0x02, 0x03), n_params, s_params, "NotoSerifJP-Black.ttf")

    @text3.error
    async def text3_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

    @commands.command(name="text4", aliases=["テキスト4"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def text4(self, ctx, *, args: str):
        if not args.lower().endswith(" square"):
            return await ctx.send(embed=create_embed("エラー", "この文字はsquare(スタンプモード)専用です。\n例: `text4 もっちーぽっぷ square`", discord.Color.orange(), "warning"))
        
        clean_text = args[:-7].strip()
        if not clean_text:
            return await ctx.send(embed=create_embed("引数エラー", "画像にするテキスト内容が空です。", discord.Color.orange(), "warning"))

        img = generate_text4_hd(clean_text, os.path.join(FONTS_DIR, "MochiyPopOne-Regular.ttf"))
        await self._send_img(ctx, img, "テキスト4 (変形)")

    @text4.error
    async def text4_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

    @commands.command(name="text5", aliases=["テキスト5"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def text5(self, ctx, *, args: str):
        if not args.lower().endswith(" square"):
            return await ctx.send(embed=create_embed("エラー", "この文字はsquare(スタンプモード)専用です。\n例: `text5 グラデーション square`", discord.Color.orange(), "warning"))
        
        clean_text = args[:-7].strip()
        if not clean_text:
            return await ctx.send(embed=create_embed("引数エラー", "画像にするテキスト内容が空です。", discord.Color.orange(), "warning"))

        img = generate_text5_gradient(clean_text, os.path.join(FONTS_DIR, "MochiyPopOne-Regular.ttf"))
        await self._send_img(ctx, img, "テキスト5 (虹色)")

    @text5.error
    async def text5_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "画像にするテキストを指定してください。", discord.Color.orange(), "warning"))

    @commands.command(name="watermark", aliases=["ウォーターマーク", "うぉーたーまーく"])
    @commands.cooldown(1, 15, commands.BucketType.user)
    async def watermark(self, ctx):
        if not ctx.message.attachments or not ctx.message.attachments[0].content_type.startswith("image/"):
            return await ctx.send(embed=create_embed("エラー", "画像を添付してください。", discord.Color.orange(), "warning"))
        
        attachment = ctx.message.attachments[0]
        async with ctx.typing():
            image_bytes = await attachment.read()
            try:
                width, height = Image.open(io.BytesIO(image_bytes)).size
                if not width or not height:
                    raise ValueError("invalid image size")
                ratio = width / height
            except Exception:
                return await ctx.send(embed=create_embed("エラー", "無効な画像サイズです。", discord.Color.orange(), "warning"))
            valid_templates = [template for template in TEMPLATES_DATA if os.path.exists(os.path.join(TEMPLATES_DIR, template["name"]))]
            if not valid_templates:
                return await ctx.send(embed=create_embed("エラー", "利用可能なテンプレートが見つかりませんでした。", discord.Color.orange(), "warning"))
            valid_templates.sort(key=lambda template: abs(template["match_ratio_wh"] - ratio))
            selected = random.choice(valid_templates[:min(4, len(valid_templates))])
            res = process_and_composite_image(image_bytes, selected)
            
            if res:
                final, resized = await resize_if_too_large(res, "PNG")
                if final:
                    file = discord.File(final, filename=f"wm_{os.path.splitext(attachment.filename)[0]}.png")
                    desc = f"使用テンプレート: `{selected['name']}`{' (リサイズ済)' if resized else ''}"
                    embed = create_embed("ウォーターマーク加工完了", desc, discord.Color.blue(), "success")
                    embed.set_image(url=f"attachment://{file.filename}")
                    await ctx.send(embed=embed, file=file)
                else:
                    await ctx.send(embed=create_embed("エラー", "画像の最終処理に失敗しました。", discord.Color.red(), "danger"))
            else:
                await ctx.send(embed=create_embed("エラー", "画像の加工に失敗しました。", discord.Color.red(), "danger"))

    @watermark.error
    async def watermark_error(self, ctx, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.send(embed=create_embed("クールダウン中", f"あと {error.retry_after:.1f}秒 お待ちください。", discord.Color.orange(), "pending"))

    @commands.command(name="gaming", aliases=["ゲーミング", "げーみんぐ"])
    @commands.cooldown(1, 15, commands.BucketType.user)
    async def gaming(self, ctx):
        if not ctx.message.attachments or not ctx.message.attachments[0].content_type.startswith("image/"):
            return await ctx.send(embed=create_embed("エラー", "画像を添付してください。", discord.Color.orange(), "warning"))
        
        attachment = ctx.message.attachments[0]
        async with ctx.typing():
            gif_io = create_gaming_gif(await attachment.read())
            if gif_io:
                final, resized = await resize_if_too_large(gif_io, "GIF")
                if final:
                    file = discord.File(final, filename=f"gaming_{os.path.splitext(attachment.filename)[0]}.gif")
                    desc = f"うまくいかない場合は、カラー画像を添付してください。{' (リサイズ済)' if resized else ''}"
                    embed = create_embed("ゲーミングGIF生成完了", desc, discord.Color.purple(), "success")
                    embed.set_image(url=f"attachment://{file.filename}")
                    await ctx.send(embed=embed, file=file)
                else:
                    await ctx.send(embed=create_embed("エラー", "画像の最終処理に失敗しました。", discord.Color.red(), "danger"))
            else:
                await ctx.send(embed=create_embed("エラー", "ゲーミングGIFの生成に失敗しました。", discord.Color.red(), "danger"))

    @gaming.error
    async def gaming_error(self, ctx, error):
        if isinstance(error, commands.CommandOnCooldown):
            await ctx.send(embed=create_embed("クールダウン中", f"あと {error.retry_after:.1f}秒 お待ちください。", discord.Color.orange(), "pending"))

    @commands.command(name="voice", aliases=["ボイス", "ぼいす", "ボイチェン"])
    @commands.cooldown(1, 20, commands.BucketType.user)
    async def voice(self, ctx, *, text_input: str = None):
        if not ctx.message.attachments and not text_input:
            return await ctx.send(embed=create_embed("引数エラー", "音声ファイルを添付するか、変換したいテキストを入力してください。\n例: `voice こんにちは`", discord.Color.orange(), "warning"))
        status = await ctx.reply(embed=create_embed("処理開始", "音声処理を開始します...", discord.Color.light_grey(), "pending"), mention_author=False)
        extension, name = "wav", "text_to_speech"
        if ctx.message.attachments:
            attachment = ctx.message.attachments[0]
            extension = os.path.splitext(attachment.filename)[1].lower().lstrip(".")
            if extension not in {"wav", "mp3", "flac", "m4a"}:
                return await status.edit(embed=create_embed("エラー", "対応している音声ファイル形式は `.wav`, `.mp3`, `.flac`, `.m4a` です。", discord.Color.orange(), "warning"))
            source = await attachment.read()
            name = os.path.splitext(attachment.filename)[0]
        else:
            await status.edit(embed=create_embed("音声生成中...", f"「{text_input[:30]}{'...' if len(text_input) > 30 else ''}」をVoiceVoxで音声生成中...", discord.Color.green(), "pending", "VoiceVox API"))
            stream = await generate_voicevox_audio(text_input, 11)
            if not stream:
                return await status.edit(embed=create_embed("APIエラー", "VoiceVoxでの音声生成に失敗しました。", discord.Color.red(), "danger", "VoiceVox API"))
            source = stream.getvalue()
        await status.edit(embed=create_embed("RVC処理中", "やまかわボイチェンで変換しています...\n(目安: 20-50秒)", discord.Color.red(), "pending"))
        converted = await convert_audio(source, extension)
        if not converted:
            return await status.edit(embed=create_embed("RVCエラー", "音声変換プロセスでエラーが発生しました。", discord.Color.red(), "danger"))
        await status.edit(embed=create_embed("音声変換完了", "うまくいかない場合はBGMを抜いてみてください。", discord.Color.green(), "success"), attachments=[discord.File(io.BytesIO(converted), filename=f"rvc_{name}.wav")])

    @commands.command(name="5000", aliases=["5000兆円"])
    @commands.cooldown(1, 5, commands.BucketType.user)
    async def choyen(self, ctx, top: str, bottom: str, *options):
        hoshii = "hoshii" in options
        rainbow = "rainbow" in options
        url = get_5000choyen_url(top, bottom, hoshii, rainbow)
        
        async with ctx.typing():
            async with aiohttp.ClientSession() as s:
                async with s.get(url) as r:
                    if r.status == 200:
                        embed = create_embed("5000兆円欲しい！", "", discord.Color.gold(), "success", "5000choyen-api")
                        embed.set_image(url=url)
                        await ctx.send(embed=embed)
                    else:
                        await ctx.send(embed=create_embed("エラー", f"画像生成に失敗しました。(APIステータス: {r.status})", discord.Color.red(), "danger", "5000choyen-api"))

    @choyen.error
    async def choyen_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "引数が不足しています。\n例: `5000 上の文字 下の文字`", discord.Color.orange(), "warning"))

async def setup(bot):
    await bot.add_cog(Media(bot))
