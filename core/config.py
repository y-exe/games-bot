# core/config.py
import os
from dotenv import load_dotenv
import pytz

load_dotenv()

# プロジェクトのルートパス
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- APIキー ---
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
VOICEVOX_API_KEY = os.getenv("VOICEVOX_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# --- 外部APIエンドポイント ---
WEATHER_API_BASE_URL = "https://weather.tsukumijima.net/api/forecast/city/"
PRIMARY_AREA_XML_URL = "https://weather.tsukumijima.net/primary_area.xml"
EXCHANGE_RATE_API_URL = "https://exchange-rate-api.krnk.org/api/rate"
AMAZON_SHORTURL_ENDPOINT = "https://www.amazon.co.jp/associates/sitestripe/getShortUrl"
VOICEVOX_API_BASE_URL = "https://deprecatedapis.tts.quest/v2/voicevox/audio/"

# DeepSeek設定
DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

# --- タイムゾーン ---
JST = pytz.timezone("Asia/Tokyo")

# --- データファイルパス ---
DATA_DIR = os.getenv("DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)
SETTINGS_FILE = os.path.join(DATA_DIR, "bot_settings.json")
POINTS_FILE = os.path.join(DATA_DIR, "game_points.json")
LOGIN_DATA_FILE = os.path.join(DATA_DIR, "login_bonus_data.json")
CITY_CODES_FILE = os.path.join(DATA_DIR, "weather_city_codes.json")

# --- アセットディレクトリ ---
FONTS_DIR = os.path.join(BASE_DIR, "assets", "fonts")
TEMPLATES_DIR = os.path.join(BASE_DIR, "assets", "watermark_templates")
WAIFU2X_PATH = os.getenv("WAIFU2X_CAFFE_PATH")

# --- Bot定数 ---
DUMMY_PREFIX = "!@#$%^&SUGIYAMA_BOT_DUMMY_PREFIX_XYZ_VERY_UNIQUE"
MAX_FILE_SIZE = int(7.8 * 1024 * 1024)
MIN_IMAGE_DIMENSION = 300
VOICEVOX_SPEAKER_ID = 11

IMAKITA_RATE_LIMIT_SECONDS = 60
IMAKITA_RATE_LIMIT_COUNT = 5
AFK_TIMEOUT_SECONDS = 180
