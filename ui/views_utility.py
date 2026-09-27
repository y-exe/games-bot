import discord

from core.constants import TIMEZONE_MAP
from ui.embeds import create_embed


class TimeHelpView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=60)

    @discord.ui.button(label="国コード一覧を表示", style=discord.ButtonStyle.secondary)
    async def show_timezones(self, interaction: discord.Interaction, button: discord.ui.Button):
        help_text = "\n".join(
            f"`{code}`: {timezone.split('/')[-1].replace('_', ' ')}"
            for code, timezone in sorted(TIMEZONE_MAP.items())
        )
        await interaction.response.send_message(
            embed=create_embed("Timeコマンド ヘルプ", f"利用可能な国/地域コード (一部):\n{help_text}", discord.Color.blue(), "info"),
            ephemeral=True,
        )
        self.stop()
