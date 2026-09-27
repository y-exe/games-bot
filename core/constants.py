# core/constants.py

BOT_ICON_URL = "https://raw.githubusercontent.com/y-exe/sugiyama-bot/main/icon.jpg"

STATUS_EMOJIS = {
    "success": "<:status_success:1434921946298060932>",
    "danger": "<:status_danger:1434924002551267420>",
    "info": "<:status_info:1434923060179501108>",
    "warning": "<:status_warning:1434922926066634873>",
    "pending": "<:status_pending:1434922066431316019>"
}

EMPTY, BLACK, WHITE = 0, 1, 2
GREEN_SQUARE = "<:o0:1387735237173182544>"
BLACK_STONE = "<:o2:1387735312129593445>"
WHITE_STONE = "<:o1:1387735281775411220>"

MARKERS = ["<:0_o:1387735948812488734>","<:1_o:1387735961374560368>","<:2_o:1387735974582423663>","<:3_o:1387735988629147710>","<:4_o:1387736001157398568>","<:5_o:1387736014591758367>","<:6_o:1387736028684750868>","<:7_o:1387736046099501077>","<:8_o:1387736058783072266>","<:9_o:1387736070518603776>","<:o_A:1380638761288859820>","<:o_B:1380638762941419722>","<:o_C:1380638764782850080>","<:o_D:1380638769216225321>","<:o_E:1380638771178897559>","<:o_F:1380638773926301726>","<:o_G:1380638776103010365>","<:o_H:1380643990784966898>","<:o_I:1380644006093918248>","<:o_J:1380644004181577849>","<:o_K:1380644001652281374>","<:o_L:1380643998841966612>","<:o_M:1380643995855622254>","<:o_N:1380643993431314432>","🇴","🇵","🇶","🇷","🇸","🇹","🇺","🇻","🇼","🇽","🇾","🇿"]

HAND_EMOJIS = {"rock": "✊", "scissors": "✌️", "paper": "✋"}
EMOJI_TO_HAND = {v: k for k, v in HAND_EMOJIS.items()}

JANKEN_WIN_POINTS, JANKEN_LOSE_POINTS, JANKEN_DRAW_POINTS = 7, -5, 2
CONNECTFOUR_WIN_POINTS, CONNECTFOUR_LOSE_POINTS, CONNECTFOUR_DRAW_POINTS = 30, -20, 10

CONNECTFOUR_MARKERS = MARKERS[1:8]
CF_EMPTY, CF_P1_TOKEN, CF_P2_TOKEN = "<:4_0:1395065436114128937>", "<:4_1:1395065453675544586>", "<:4_2:1395065472491323493>"
ROWS, COLS = 6, 7

BET_DICE_PAYOUTS = {
    1: ("大凶... 賭け金は没収です。", -1.0), 2: ("凶。賭け金の半分を失いました。", -0.5),
    3: ("小吉。賭け金の半分を失いました。", -0.5), 4: ("吉！賭け金はそのまま戻ってきます。", 0.0),
    5: ("中吉！賭け金が1.5倍になりました。", 0.5), 6: ("大吉！おめでとうございます！賭け金が2倍になりました！", 1.0)
}

# ここはもういいや()　変更なし
USER_BADGES_EMOJI = {
    'staff': '<:staff:1383251602680578111>', 'partner': '<:partnerserver:1383251682070364210>',
    'hypesquad': '<:events:1383251448451563560>', 'hypesquad_bravery': '<:bravery:1383251749623693392>',
    'hypesquad_brilliance': '<:brilliance:1383251723610624174>', 'hypesquad_balance': '<:balance:1383251792413851688>',
    'bug_hunter': '<:bugHunter:1383251633567170683>', 'bug_hunter_level_2': '<:bugHunter:1383251633567170683>',
    'early_supporter': '<:earlysupporter:1383251618379727031>', 'early_verified_bot_developer': '<:earlyverifiedbot:1383251648348160030>',
    'verified_bot_developer': '<:earlyverifiedbot:1383251648348160030>', 'discord_certified_moderator': '<:moderator:1383251587438215218>',
    'active_developer': '<:activedeveloper:1383253229189730374>', 'nitro': '<:nitro:1383252018532974642>', 'booster': '<:booster:1383251702144176168>',
}

TEMPLATES_DATA = [
    {"name": "POCO F3.png", "user_ratio_str": "3/4", "target_size": (3000, 4000)},
    {"name": "GalaxyS23 2.png", "user_ratio_str": "563/1000", "target_size": (2252, 4000)},
    {"name": "IPHONE 11 PRO MAX.png", "user_ratio_str": "672/605", "target_size": (4032, 3630)},
    {"name": "motorola eage 50s pro.png", "user_ratio_str": "4/3", "target_size": (4096, 3072)},
    {"name": "XIAOMI 15 Ultra 1.png", "user_ratio_str": "320/277", "target_size": (1280, 1108)}, 
    {"name": "Galaxy S23.png", "user_ratio_str": "1000/563", "target_size": (4000, 2252)},
    {"name": "XIAOMI13.png", "user_ratio_str": "512/329", "target_size": (4096, 2632)},
    {"name": "Vivo X200 Pro.png", "user_ratio_str": "512/329", "target_size": (4096, 2632)},
    {"name": "OPPO Find X5 2.png", "user_ratio_str": "512/439", "target_size": (4096, 3512)},
    {"name": "OPPO Find X5.png", "user_ratio_str": "3/4", "target_size": (1080, 1440)},
    {"name": "NIKON1J5.png", "user_ratio_str": "548/461", "target_size": (4384, 3688)},
    {"name": "REDMAGIC9PRO.png", "user_ratio_str": "6/5", "target_size": (4080, 3400)},
    {"name": "REDMI121.png", "user_ratio_str": "64/85", "target_size": (3072, 4080)},
    {"name": "REDMI122.png", "user_ratio_str": "85/64", "target_size": (4080, 3072)},
    {"name": "OPPOFINDX5PRO.png", "user_ratio_str": "256/363", "target_size": (3072, 4356)},
    {"name": "ONELINE.png", "user_ratio_str": "3175/2458", "target_size": (6530, 4916)},
    {"name": "NOTHINGPHONE2A.png", "user_ratio_str": "3265/2458", "target_size": (6530, 4916)}, 
    {"name": "VIVOX60TPRO2.png", "user_ratio_str": "3/4", "target_size": (3000, 4000)},
    {"name": "VIVOX60TPRO.png", "user_ratio_str": "4/3", "target_size": (4080, 3060)},
    {"name": "ONEPLUS11R5G.png", "user_ratio_str": "8/7", "target_size": (8192, 7168)},
    {"name": "XIAOMI15ULTRA 3.png", "user_ratio_str": "1151/1818", "target_size": (2302, 3636)},
    {"name": "XIAOMI15ULTRA 2.png", "user_ratio_str": "568/503", "target_size": (4544, 4024)},
    {"name": "HONORMAGIC7PRO.png", "user_ratio_str": "16/10", "target_size": (4096, 2560)},
    {"name": "ONEPLUS.png", "user_ratio_str": "4/3", "target_size": (4096, 3072)},
    {"name": "NIKOND7500.png", "user_ratio_str": "974/1591", "target_size": (3896, 6364)}, 
    {"name": "VIVOXFOLD3PRO.png", "user_ratio_str": "300/257", "target_size": (1200, 1028)},
    {"name": "VIVOX100.png", "user_ratio_str": "300/257", "target_size": (1200, 1028)},
    {"name": "HUAWEIP30PRO.png", "user_ratio_str": "4/3", "target_size": (3648, 2736)},
    {"name": "XIAOMI13ULTRA.png", "user_ratio_str": "1/1", "target_size": (2048, 2048)} 
]
for t in TEMPLATES_DATA:
    w, h = map(float, t['user_ratio_str'].split('/'))
    t['match_ratio_wh'] = w / h if h != 0 else 1.0

TIMEZONE_MAP = {
    "JP": "Asia/Tokyo", "US": "America/New_York", "GB": "Europe/London",
    "UK": "Europe/London", "CN": "Asia/Shanghai", "KR": "Asia/Seoul",
    "TW": "Asia/Taipei", "AU": "Australia/Sydney", "DE": "Europe/Berlin",
    "FR": "Europe/Paris", "RU": "Europe/Moscow", "BR": "America/Sao_Paulo",
    "IN": "Asia/Kolkata", "CA": "America/Toronto", "SG": "Asia/Singapore"
}
