# cogs/games.py
import discord
from discord.ext import commands
import asyncio
import random
from core.state import state
from core.constants import BLACK, WHITE, EMPTY, MARKERS, CONNECTFOUR_MARKERS, CF_EMPTY, CF_P1_TOKEN, CF_P2_TOKEN, COLS, ROWS, HAND_EMOJIS, EMOJI_TO_HAND, JANKEN_WIN_POINTS, JANKEN_LOSE_POINTS, JANKEN_DRAW_POINTS, CONNECTFOUR_WIN_POINTS, CONNECTFOUR_LOSE_POINTS, CONNECTFOUR_DRAW_POINTS
from engines.othello import OthelloEngine
from engines.connect_four import ConnectFourEngine, get_connectfour_bot_move
from ui.views_othello import OthelloSizeSelectView, build_othello_embed
from ui.views_connect4 import ConnectFourRecruitmentView, create_cf_board_embed
from ui.views_games import JankenChoiceView
from ui.views_highlow import HighLowRecruitmentView # 【修正】募集用Viewをインポート
from ui.views_common import ConfirmLeaveView
from ui.embeds import create_embed
from data.points_manager import points_manager
from core.config import AFK_TIMEOUT_SECONDS

# --- Helper Functions ---
# (前回の回答と同じ send_othello_result_message_helper, send_connectfour_result_message_helper は省略せずにここに含めます)
# ※ 紙面の都合上、前回のコードと同じヘルパー関数群はそのまま維持されている前提で記述します。
# 実際にはここに send_othello_result_message_helper 等の定義が入ります。

async def send_othello_result_message_helper(channel, game_session, original_message, reason_key="normal"):
    game = game_session["game"]
    try: await original_message.edit(embed=build_othello_embed(game_session), view=None)
    except: pass
    try: await original_message.clear_reactions()
    except: pass

    result_embed = create_embed(f"オセロゲーム #{game.game_id} 結果", "", discord.Color.gold(), "success")
    winner_text, points_text = "引き分け", ""
    p_black, p_white = game.players[BLACK], game.players[WHITE]
    is_bot = (channel.guild.me.id in [p_black, p_white])

    if game.winner != EMPTY:
        winner_id = game.players[game.winner]
        loser_id = game.players[WHITE if game.winner == BLACK else BLACK]
        w_stone = "⚫" if game.winner == BLACK else "⚪"
        r_text = f"（{reason_key}）" if reason_key != "normal" else ""
        winner_text = f"🏆 {w_stone} <@{winner_id}> の勝ち！ {r_text}"
        
        if not is_bot:
            b_score = sum(r.count(BLACK) for r in game.board)
            w_score = sum(r.count(WHITE) for r in game.board)
            diff = abs(b_score - w_score)
            ended_by_action = (reason_key != "normal")
            win_pt, lose_pt = 0, 0
            
            if ended_by_action:
                bonus = max(0, (b_score if winner_id == p_black else w_score) - (w_score if winner_id == p_black else b_score))
                if game.board_size == 6: win_pt, lose_pt = 20 + bonus, -15 + bonus
                elif game.board_size == 8: win_pt, lose_pt = 20 + bonus*2, -15 + bonus*2
                else: win_pt, lose_pt = 30 + bonus*3, -10 + bonus*3
            else:
                if game.board_size == 6: win_pt, lose_pt = diff * 2 + 20, max(0, 30 - diff)
                elif game.board_size == 8: win_pt, lose_pt = diff * 3 + 20, max(0, 50 - diff)
                else: win_pt, lose_pt = diff * 4 + 30, max(0, 60 - diff)
            
            points_manager.update_points(winner_id, win_pt)
            points_manager.update_points(loser_id, -lose_pt)
            points_text = f"▫️ <@{winner_id}>: `+{win_pt}pt`\n▫️ <@{loser_id}>: `{-lose_pt}pt`"

    elif game.winner == EMPTY and reason_key == "normal":
        if not is_bot:
            draw_pt = 5
            points_manager.update_points(p_black, draw_pt)
            points_manager.update_points(p_white, draw_pt)
            points_text = f"▫️ 両者: `+{draw_pt}pt`"
        winner_text = "🤝 引き分け！"

    result_embed.add_field(name="結果", value=winner_text, inline=False)
    if points_text: result_embed.add_field(name="ポイント変動", value=points_text, inline=False)
    try: await original_message.reply(embed=result_embed, mention_author=False)
    except: pass

async def send_connectfour_result_message_helper(channel, game, message, reason_key="normal"):
    try: await message.edit(embed=create_cf_board_embed(game), view=None)
    except: pass
    try: await message.clear_reactions()
    except: pass

    res_embed = create_embed(f"四目並べ #{game.game_id} 結果", "", discord.Color.gold(), "success")
    win_txt, pt_txt = "引き分け", ""
    is_bot = (channel.guild.me.id in game.players.values())

    if game.winner:
        wid = game.players[game.winner]
        lid = next(p for p in game.players.values() if p != wid)
        reason = f"（{reason_key}）" if reason_key != "normal" else ""
        win_txt = f"🏆 {game.winner} <@{wid}> の勝ち！{reason}"
        if not is_bot:
            points_manager.update_points(wid, CONNECTFOUR_WIN_POINTS)
            points_manager.update_points(lid, CONNECTFOUR_LOSE_POINTS)
            pt_txt = f"▫️ <@{wid}>: `{CONNECTFOUR_WIN_POINTS:+}pt`\n▫️ <@{lid}>: `{CONNECTFOUR_LOSE_POINTS:+}pt`"
    elif not is_bot:
        for p in game.players.values(): points_manager.update_points(p, CONNECTFOUR_DRAW_POINTS)
        pt_txt = f"▫️ 両者: `+{CONNECTFOUR_DRAW_POINTS}pt`"

    res_embed.add_field(name="結果", value=win_txt, inline=False)
    if pt_txt: res_embed.add_field(name="ポイント", value=pt_txt, inline=False)
    await message.reply(embed=res_embed, mention_author=False)

# --- Game Logics (Tasks) ---
async def start_othello_logic(message, session, bot):
    game = session["game"]
    game.calculate_valid_moves(game.current_player)
    bot_id = bot.user.id if hasattr(bot, "user") and bot.user else getattr(bot, "id", None)
    if game.get_current_player_id() == bot_id:
        asyncio.create_task(run_othello_bot_turn(message, session, bot))
    else:
        await update_othello_reactions(message, game)

async def update_othello_reactions(message, game):
    try:
        msg = await message.channel.fetch_message(message.id)
        current_reactions = {str(r.emoji) for r in msg.reactions if r.me}
        needed = set(game.valid_moves_with_markers.values())
        to_remove = current_reactions - needed
        to_add = needed - current_reactions
        for r in to_remove: await msg.remove_reaction(r, msg.guild.me)
        sorted_add = sorted(list(to_add), key=lambda x: MARKERS.index(x) if x in MARKERS else 999)
        for r in sorted_add: await msg.add_reaction(r)
    except: pass

async def run_othello_bot_turn(message, session, bot):
    game = session["game"]
    if game.game_over: return
    await asyncio.sleep(random.uniform(0.5, 1.0))
    valid = game.calculate_valid_moves(game.current_player)
    if not valid:
        game.switch_player()
        game.check_game_status()
        if game.game_over:
            await send_othello_result_message_helper(message.channel, session, message)
            if message.id in state.active_games: del state.active_games[message.id]
        else:
            await message.edit(embed=build_othello_embed(session))
            await update_othello_reactions(message, game)
        return
    corners = {(0,0), (0, game.board_size-1), (game.board_size-1, 0), (game.board_size-1, game.board_size-1)}
    corner_moves = [m for m in valid if m in corners]
    move = random.choice(corner_moves) if corner_moves else random.choice(valid)
    game.make_move(move[0], move[1], game.current_player)
    game.switch_player()
    game.check_game_status()
    await message.edit(embed=build_othello_embed(session))
    if game.game_over:
        await send_othello_result_message_helper(message.channel, session, message)
        if message.id in state.active_games: del state.active_games[message.id]
    else:
        bot_id = bot.user.id if hasattr(bot, "user") and bot.user else getattr(bot, "id", None)
        if game.get_current_player_id() == bot_id:
            asyncio.create_task(run_othello_bot_turn(message, session, bot))
        else:
            await update_othello_reactions(message, game)

async def run_connectfour_bot_turn(message, game):
    await asyncio.sleep(random.uniform(0.8, 1.5))
    bot_col = get_connectfour_bot_move(game)
    if bot_col != -1:
        game.drop_token(bot_col)
        if game.check_win() or game.is_board_full():
            await send_connectfour_result_message_helper(message.channel, game, message)
            if message.id in state.active_connectfour_games: del state.active_connectfour_games[message.id]
            return
        game.switch_player()
        await message.edit(embed=create_cf_board_embed(game))

class Games(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name="othello", aliases=["おせろ", "オセロ"])
    async def othello(self, ctx, opponent: discord.Member = None):
        if opponent and (opponent == ctx.author or (opponent.bot and opponent.id != self.bot.user.id)):
            return await ctx.send(embed=create_embed("エラー", "不正な対戦相手です。", status="warning"))
        for s in state.active_games.values():
            if ctx.author.id in s["game"].players.values():
                return await ctx.send(embed=create_embed("エラー", "既に参加中のゲームがあります。", status="warning"))
        desc = f"{ctx.author.mention} さん、盤面サイズを選んでください。\n**サイズでポイント配分が変わります**"
        view = OthelloSizeSelectView(ctx.author, opponent)
        await ctx.send(embed=create_embed("オセロ 盤面選択", desc, discord.Color.green(), "info"), view=view)

    @commands.command(name="connectfour", aliases=["cf", "四目並べ", "4moku", "4nara", "よんもく", "4目並べ"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def connectfour(self, ctx, opponent: discord.Member = None):
        if opponent and (opponent == ctx.author or (opponent.bot and opponent.id != self.bot.user.id)):
            return await ctx.send(embed=create_embed("エラー", "不正な対戦相手です。", status="warning"))
        desc = f"{ctx.author.mention} が四目並べの対戦相手を募集しています。\nルール: 縦横斜めに4つ揃えたら勝ち。"
        view = ConnectFourRecruitmentView(ctx.author, opponent)
        await ctx.send(embed=create_embed("四目並べ 募集", desc, discord.Color.blue(), "info"), view=view)

    @commands.command(name="highlow", aliases=["hl", "ハイロー"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def highlow(self, ctx, bet_amount_str: str, opponent: discord.Member):
        if opponent == ctx.author or opponent.bot:
            return await ctx.send(embed=create_embed("エラー", "対戦相手が不正です。", status="warning"))
        try:
            bet_amount = int(bet_amount_str)
            if bet_amount <= 0: raise ValueError
        except ValueError:
            return await ctx.send(embed=create_embed("エラー", "ベット額は正の整数で指定してください。", status="warning"))

        host_pt = points_manager.get_points(ctx.author.id)
        if host_pt < bet_amount:
            return await ctx.send(embed=create_embed("ポイント不足", f"所持: `{host_pt}pt`", status="warning"))

        desc = (f"{ctx.author.mention} が <@{opponent.id}> にベット `{bet_amount}pt` でハイアンドロー対戦を申し込みました。\n"
                f"承認すると、お互いの所持ポイントから `{bet_amount}pt` が引かれます。")
        view = HighLowRecruitmentView(ctx.author, opponent, bet_amount)
        msg = await ctx.send(content=opponent.mention, embed=create_embed("ハイアンドロー 募集", desc, discord.Color.purple(), "info"), view=view)
        view.message = msg

    @highlow.error
    async def highlow_error(self, ctx, error):
        if isinstance(error, commands.MissingRequiredArgument):
            await ctx.send(embed=create_embed("引数不足", "ベット額と対戦相手を指定してください。\n例: `highlow 100 @相手`", status="warning"))

    @commands.command(name="janken", aliases=["じゃんけん", "ジャンケン"])
    @commands.cooldown(1, 10, commands.BucketType.user)
    async def janken(self, ctx):
        desc = f"{ctx.author.mention} がじゃんけんを開始しました。\nまず自分の手を選んでください。"
        view = JankenChoiceView(ctx.author.id)
        msg = await ctx.send(embed=create_embed("じゃんけん", desc, discord.Color.blue(), "pending"), view=view)
        state.active_janken_games[msg.id] = {"host_id": ctx.author.id, "host_hand": None, "message": msg, "game_status": "host_choosing"}

    @commands.command(name="leave", aliases=["退出", "たいしゅつ"])
    async def leave(self, ctx):
        target_session, mid, gtype = None, None, None
        for m, s in state.active_games.items():
            if ctx.author.id in s["game"].players.values() and not s["game"].game_over:
                target_session, mid, gtype = s, m, "othello"
                break
        if not target_session:
            for m, g in state.active_connectfour_games.items():
                if ctx.author.id in g.players.values() and not g.game_over:
                    target_session, mid, gtype = g, m, "connectfour"
                    break
        if not target_session:
            return await ctx.send(embed=create_embed("エラー", "参加中のゲームはありません。", status="warning"))
        game_obj = target_session["game"] if gtype == "othello" else target_session
        view = ConfirmLeaveView(ctx.author, target_session, mid, gtype, game_obj)
        await ctx.send(embed=create_embed("確認", f"ゲーム #{game_obj.game_id} から離脱しますか？\n(負け扱いになります)", discord.Color.orange(), "warning"), view=view)

# --- Reaction Handlers ---
async def handle_othello_reaction(reaction, user):
    session = state.active_games.get(reaction.message.id)
    if not session: return
    game = session["game"]
    if user.id != game.get_current_player_id():
        try: await reaction.remove(user)
        except: pass
        return
    chosen = None
    for c, m in game.valid_moves_with_markers.items():
        if str(reaction.emoji) == m:
            chosen = c
            break
    if chosen:
        try: await reaction.remove(user) 
        except: pass
        game.make_move(chosen[0], chosen[1], game.current_player)
        game.switch_player()
        game.check_game_status()
        await reaction.message.edit(embed=build_othello_embed(session))
        if game.game_over:
            await send_othello_result_message_helper(reaction.message.channel, session, reaction.message)
            del state.active_games[reaction.message.id]
        else:
            bot_id = reaction.message.guild.me.id
            if game.get_current_player_id() == bot_id:
                asyncio.create_task(run_othello_bot_turn(reaction.message, session, reaction.message.guild.me))
            else:
                await update_othello_reactions(reaction.message, game)

async def handle_janken_reaction(reaction, user):
    game_data = state.active_janken_games.get(reaction.message.id)
    if not game_data or game_data["game_status"] != "opponent_recruiting": return
    if user.id == game_data["host_id"]: return
    op_hand = EMOJI_TO_HAND.get(str(reaction.emoji))
    if not op_hand: return
    host_id = game_data["host_id"]
    host_hand = game_data["host_hand"]
    res = judge_janken(host_hand, op_hand)
    winner, loser = None, None
    if res == 1: winner, loser = host_id, user.id
    elif res == 2: winner, loser = user.id, host_id
    pt_txt = ""
    if winner:
        points_manager.update_points(winner, JANKEN_WIN_POINTS)
        points_manager.update_points(loser, JANKEN_LOSE_POINTS)
        pt_txt = f"<@{winner}>: `{JANKEN_WIN_POINTS:+}pt`\n<@{loser}>: `{JANKEN_LOSE_POINTS:+}pt`"
        res_text = f"🏆 <@{winner}> の勝ち！"
    else:
        points_manager.update_points(host_id, JANKEN_DRAW_POINTS)
        points_manager.update_points(user.id, JANKEN_DRAW_POINTS)
        pt_txt = f"両者: `{JANKEN_DRAW_POINTS:+}pt`"
        res_text = "🤝 引き分け！"
    msg = game_data["message"]
    try: await msg.clear_reactions()
    except: pass
    embed = create_embed("じゃんけん 結果", f"<@{host_id}>: {HAND_EMOJIS[host_hand]}\n{user.mention}: {HAND_EMOJIS[op_hand]}\n\n**{res_text}**", discord.Color.gold(), "success")
    embed.add_field(name="ポイント", value=pt_txt)
    await msg.reply(embed=embed, mention_author=False)
    del state.active_janken_games[reaction.message.id]

async def handle_cf_reaction(reaction, user):
    game = state.active_connectfour_games.get(reaction.message.id)
    if not game or game.game_over: return
    if user.id != game.get_current_player_id():
        try: await reaction.remove(user)
        except: pass
        return
    try: col = CONNECTFOUR_MARKERS.index(str(reaction.emoji))
    except: return
    try: await reaction.remove(user)
    except: pass
    if game.drop_token(col):
        if game.check_win() or game.is_board_full():
            await send_connectfour_result_message_helper(reaction.message.channel, game, reaction.message)
            del state.active_connectfour_games[reaction.message.id]
            return
        game.switch_player()
        await reaction.message.edit(embed=create_cf_board_embed(game))
        if game.get_current_player_id() == reaction.message.guild.me.id:
            asyncio.create_task(run_connectfour_bot_turn(reaction.message, game))

def judge_janken(h1, h2):
    if h1 == h2: return 0
    if (h1=="rock" and h2=="scissors") or (h1=="scissors" and h2=="paper") or (h1=="paper" and h2=="rock"):
        return 1
    return 2

async def setup(bot):
    await bot.add_cog(Games(bot))
