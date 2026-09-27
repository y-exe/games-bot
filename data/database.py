import json
import os

import psycopg

from core.config import DATABASE_URL, SETTINGS_FILE, POINTS_FILE, LOGIN_DATA_FILE, CITY_CODES_FILE


class Database:
    def __init__(self):
        self.connection = None

    def initialize(self):
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL が設定されていません。")
        self.connection = psycopg.connect(DATABASE_URL, autocommit=True)
        with self.connection.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS games_bot_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
                CREATE TABLE IF NOT EXISTS games_bot_economy (
                    user_id numeric(20,0) PRIMARY KEY, points bigint NOT NULL DEFAULT 0,
                    last_login date, consecutive_days smallint NOT NULL DEFAULT 0,
                    gamble_date date, gamble_count smallint NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS games_bot_economy_points_idx ON games_bot_economy (points DESC);
                CREATE TABLE IF NOT EXISTS games_bot_allowed_channels (channel_id bigint PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS games_bot_weather_cities (city_name text PRIMARY KEY, city_id text NOT NULL);
            """)
        self._import_json_once()

    @staticmethod
    def _read_json(path, default):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return default

    def _import_json_once(self):
        with self.connection.cursor() as cur:
            cur.execute("SELECT 1 FROM games_bot_migrations WHERE version = 1")
            if cur.fetchone():
                return
            points = self._read_json(POINTS_FILE, {})
            logins = self._read_json(LOGIN_DATA_FILE, {})
            for user_id, value in points.items():
                login = logins.get(user_id, {})
                gamble = login.get("gamble_info", {})
                cur.execute("""INSERT INTO games_bot_economy (user_id, points, last_login, consecutive_days, gamble_date, gamble_count)
                    VALUES (%s, %s, NULLIF(%s, '2000-01-01')::date, %s, NULLIF(%s, '2000-01-01')::date, %s)
                    ON CONFLICT (user_id) DO NOTHING""", (int(user_id), value, login.get("last_login", "2000-01-01"), login.get("consecutive_days", 0), gamble.get("date", "2000-01-01"), gamble.get("count", 0)))
            for user_id, login in logins.items():
                if user_id not in points:
                    gamble = login.get("gamble_info", {})
                    cur.execute("INSERT INTO games_bot_economy (user_id, last_login, consecutive_days, gamble_date, gamble_count) VALUES (%s, NULLIF(%s, '2000-01-01')::date, %s, NULLIF(%s, '2000-01-01')::date, %s) ON CONFLICT DO NOTHING", (int(user_id), login.get("last_login", "2000-01-01"), login.get("consecutive_days", 0), gamble.get("date", "2000-01-01"), gamble.get("count", 0)))
            for channel_id in self._read_json(SETTINGS_FILE, {}).get("allowed_channels", []):
                cur.execute("INSERT INTO games_bot_allowed_channels VALUES (%s) ON CONFLICT DO NOTHING", (channel_id,))
            for name, city_id in self._read_json(CITY_CODES_FILE, {}).items():
                cur.execute("INSERT INTO games_bot_weather_cities VALUES (%s, %s) ON CONFLICT DO NOTHING", (name, city_id))
            cur.execute("INSERT INTO games_bot_migrations (version) VALUES (1)")

    def economy_rows(self):
        with self.connection.cursor() as cur:
            cur.execute("SELECT user_id, points, last_login, consecutive_days, gamble_date, gamble_count FROM games_bot_economy")
            return cur.fetchall()

    def change_points(self, user_id, amount):
        with self.connection.cursor() as cur:
            cur.execute("INSERT INTO games_bot_economy (user_id, points) VALUES (%s, %s) ON CONFLICT (user_id) DO UPDATE SET points = games_bot_economy.points + EXCLUDED.points RETURNING points", (user_id, amount))
            return cur.fetchone()[0]

    def save_economy(self, points, logins):
        with self.connection.cursor() as cur:
            for user_id, value in points.items():
                login, gamble = logins.get(str(user_id), {}), logins.get(str(user_id), {}).get("gamble_info", {})
                cur.execute("""INSERT INTO games_bot_economy (user_id, points, last_login, consecutive_days, gamble_date, gamble_count) VALUES (%s,%s,NULLIF(%s,'2000-01-01')::date,%s,NULLIF(%s,'2000-01-01')::date,%s)
                ON CONFLICT (user_id) DO UPDATE SET points=EXCLUDED.points,last_login=EXCLUDED.last_login,consecutive_days=EXCLUDED.consecutive_days,gamble_date=EXCLUDED.gamble_date,gamble_count=EXCLUDED.gamble_count""", (int(user_id), value, login.get("last_login", "2000-01-01"), login.get("consecutive_days", 0), gamble.get("date", "2000-01-01"), gamble.get("count", 0)))

    def allowed_channels(self):
        with self.connection.cursor() as cur:
            cur.execute("SELECT channel_id FROM games_bot_allowed_channels")
            return {row[0] for row in cur.fetchall()}

    def save_allowed_channels(self, channels):
        with self.connection.cursor() as cur:
            cur.execute("TRUNCATE games_bot_allowed_channels")
            cur.executemany("INSERT INTO games_bot_allowed_channels VALUES (%s)", [(channel,) for channel in channels])


database = Database()
