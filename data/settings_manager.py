# data/settings_manager.py
from core.state import state
from data.database import database

class SettingsManager:
    @staticmethod
    def load_settings():
        """JSONから許可されたチャンネルを読み込み、stateに反映する"""
        state.allowed_channels = database.allowed_channels()
        print(f"[Settings] {len(state.allowed_channels)} 個の許可チャンネルを読み込みました。")

    @staticmethod
    def save_settings():
        """現在のstate.allowed_channelsをJSONファイルに保存する"""
        database.save_allowed_channels(state.allowed_channels)

settings_manager = SettingsManager()
