# data/points_manager.py
from data.database import database

class PointsManager:
    def __init__(self):
        self.game_points = {}
        self.login_bonus_data = {}

    def load(self):
        self.game_points, self.login_bonus_data = {}, {}
        for user_id, points, last_login, consecutive_days, gamble_date, gamble_count in database.economy_rows():
            key = str(user_id)
            self.game_points[key] = points
            data = {"consecutive_days": consecutive_days}
            if last_login: data["last_login"] = last_login.isoformat()
            if gamble_date: data["gamble_info"] = {"date": gamble_date.isoformat(), "count": gamble_count}
            self.login_bonus_data[key] = data

    def save_all(self):
        database.save_economy(self.game_points, self.login_bonus_data)

    def get_points(self, user_id: int) -> int:
        return self.game_points.get(str(user_id), 0)

    def update_points(self, user_id: int, amount: int):
        uid_str = str(user_id)
        current = self.game_points.get(uid_str, 0)
        self.game_points[uid_str] = database.change_points(user_id, amount)

    def get_rank(self, user_id: int, bot_id: int) -> int:
        # Botを除外したランキング計算
        human_players = {pid: p for pid, p in self.game_points.items() if int(pid) != bot_id}
        if str(user_id) not in human_players:
            return -1
        sorted_players = sorted(human_players.items(), key=lambda item: item[1], reverse=True)
        try:
            rank = [p[0] for p in sorted_players].index(str(user_id)) + 1
            return rank
        except ValueError:
            return -1

# インスタンスのエクスポート
points_manager = PointsManager()
