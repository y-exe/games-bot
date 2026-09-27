# bot.py
import discord
from discord.ext import commands
import traceback
import sys
from core.config import DUMMY_PREFIX
from core.state import state
from core.constants import MARKERS, HAND_EMOJIS, EMOJI_TO_HAND, CONNECTFOUR_MARKERS

class SugiyamaBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.reactions = True
        intents.members = True
        
        super().__init__(
            command_prefix=self.get_custom_prefix,
            intents=intents,
            help_command=None,
            case_insensitive=True
        )

    async def get_custom_prefix(self, bot, message):
        return DUMMY_PREFIX

    async def setup_hook(self):
        extensions = [
            "cogs.economy",
            "cogs.games",
            "cogs.media",
            "cogs.utility",
            "cogs.system"
        ]
        for ext in extensions:
            try:
                await self.load_extension(ext)
                print(f"[Extension] {ext} をロードしました。")
            except Exception as e:
                print(f"[Extension] {ext} のロードに失敗しました: {e}")
                traceback.print_exc()
        
        # スラッシュコマンドをグローバルに同期
        await self.tree.sync()

    async def on_ready(self):
        print(f'[System]Login: {self.user.name} ({self.user.id})')
        await self.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="杉山啓太Bot by(*'▽')"))

    async def on_message(self, message: discord.Message):
        # Botのメッセージは無視
        if message.author.bot or not message.guild:
            return

        original_content = message.content
        content_lower_stripped = original_content.strip().lower()
        if not content_lower_stripped:
            return

        # 1. 管理者用: setchannel はチャンネル許可状態に関わらず反応させる
        if content_lower_stripped.startswith("setchannel"):
            message.content = f"{DUMMY_PREFIX}setchannel"
            await self.process_commands(message)
            message.content = original_content
            return

        # 2. 許可されたチャンネル以外は無視
        if message.channel.id not in state.allowed_channels:
            return

        # 3. プレフィックスなしコマンドの処理
        parts = original_content.split(" ", 1)
        cmd_name = parts[0].lower()

        is_special = False
        if cmd_name == "othello" and len(parts) > 1:
            sub = parts[1].split(" ", 1)[0].lower()
            if sub == "leave":
                cmd_name = "leave"
                is_special = True
            elif sub in ["point", "points"]:
                cmd_name = "othello point"
                is_special = True

        # コマンドが存在するか確認
        command_obj = self.get_command(cmd_name)
        if command_obj:
            # プレフィックスを内部的に付与して実行
            if is_special:
                message.content = f"{DUMMY_PREFIX}{cmd_name}"
            else:
                message.content = f"{DUMMY_PREFIX}{original_content}"
            
            await self.process_commands(message)
            message.content = original_content

    async def on_reaction_add(self, reaction: discord.Reaction, user: discord.User):
        if user.bot: return
        
        # オセロのリアクション処理
        if reaction.message.id in state.active_games:
            from cogs.games import handle_othello_reaction
            await handle_othello_reaction(reaction, user)
            
        # 四目並べのリアクション処理
        elif reaction.message.id in state.active_connectfour_games:
            from cogs.games import handle_cf_reaction
            await handle_cf_reaction(reaction, user)

        # じゃんけんのリアクション処理
        elif reaction.message.id in state.active_janken_games:
            from cogs.games import handle_janken_reaction
            await handle_janken_reaction(reaction, user)

bot = SugiyamaBot()
