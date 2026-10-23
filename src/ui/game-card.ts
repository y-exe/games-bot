import {ActionRowBuilder,ButtonStyle,StringSelectMenuBuilder} from 'discord.js';
import {Othello} from '../games/board.js';
import {pieceNames} from '../games/chess.js';
import {mineLevels} from '../games/minesweeper.js';
import {chessTimeControls,clockText} from '../games/chess-clock.js';
import {gameActionId,gameNames,cardLabel,type Session} from '../games/session.js';
import {card,button,row,type CardRow} from './cards.js';
import {boardText,markerName,markerLabel,movesPerPage} from './board-text.js';
import {emoji,handEmojis} from './emojis.js';
import {chessText,chessControls,chessMovesPerPage} from './chess-board.js';
import {minesText,minesControls,minesInfo} from './minesweeper-board.js';
import {boardLabel} from './board-labels.js';
import {formatAmount} from '../data/money.js';
import type {Hand} from '../games/session.js';

export async function gameCard(s:Session,botId:string,balance:(id:string)=>Promise<bigint>) {
  const controls: CardRow[]=[]; let body='';
  if(s.phase==='recruiting'&&s.kind==='minesweeper') {
    body=`<@${s.host}> のひとり用ゲーム\n**難易度を選んでスタート**\n初めてなら **初級** がおすすめです。\n\n${Object.values(mineLevels).map(level=>`**${level.label}** · ${level.size} × ${level.size} / 地雷 **${level.mines}個** / クリア **+${formatAmount(level.reward)}pt**`).join('\n')}\n\n**遊び方**\n行 → マスの順にボタンで選択。数字は周囲の地雷の数です。\n地雷を避けて、すべての安全なマスを開けばクリア！\n-# 最初に開くマスと周囲8マスは安全です。\n-# 実行した本人だけが選択・操作できます。選択期限 <t:${Math.floor(s.expires/1000)}:R>`;
    controls.push(row(...Object.entries(mineLevels).map(([level,spec])=>button(gameActionId(s,`difficulty_${level}`),`${spec.label} · ${spec.size}×${spec.size}`,ButtonStyle.Primary))));
    controls.push(row(button(gameActionId(s,'cancel'),'キャンセル',ButtonStyle.Secondary)));
  } else if(s.phase==='recruiting') {
    body=`<@${s.host}> が対戦相手を募集中 · **${formatAmount(await balance(s.host))}pt**${s.target?`\n**対戦相手** · <@${s.target}>`:''}\n${s.kind==='highlow'?`**賭け金** · **${formatAmount(s.bet)}pt / 人**\n-# 両者正解は返金、両者不正解は没収。`:s.kind==='othello'?`**盤面** · **${s.size} × ${s.size}**\n-# 募集者は下のメニューでサイズを変更できます。`:'-# 対戦が始まるまでポイントは動きません。'}\n\n**承認する** で参加 · 募集者は **キャンセル** で取消\n-# 募集終了 <t:${Math.floor(s.expires/1000)}:R>`;
    if(s.target===botId)body=body.replace('**承認する** で参加 · 募集者は **キャンセル** で取消','募集者は **Botと対戦** で開始 · **キャンセル** で取消');
    const recruitButtons=[button(gameActionId(s,'join'),'承認する',ButtonStyle.Success,emoji('status_success'),s.target===botId),button(gameActionId(s,'cancel'),'キャンセル',ButtonStyle.Secondary,emoji('status_warning'))];
    if(s.kind!=='highlow')recruitButtons.push(button(gameActionId(s,'bot'),'Botと対戦',ButtonStyle.Primary,emoji('status_info'),['othello','chess'].includes(s.kind)&&Boolean(s.target)&&s.target!==botId));
    controls.push(row(...recruitButtons));
    if(s.kind==='othello')controls.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(gameActionId(s,'size')).setPlaceholder('盤面サイズ').addOptions([6,8,10].map(n=>({label:`${n} × ${n}`,value:String(n),default:s.size===n})))));
    if(s.kind==='chess') {
      const tc=chessTimeControls[s.timeControl??'10+5'];
      body=body.replace('\n\n',`\n**持ち時間** · 各${tc.minutes}分${tc.increment?`＋1手${tc.increment}秒`:''}\n\n`);
      controls.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(gameActionId(s,'clock')).setPlaceholder('持ち時間').addOptions(Object.entries(chessTimeControls).map(([value,c])=>({label:`${c.minutes}分${c.increment?` + 1手${c.increment}秒`:''}`,value,default:value===(s.timeControl??'10+5')})))));
    }
  } else if(s.phase==='finished')body=`${s.result??'このゲームは終了しました。'}${s.board?`\n\n**最終盤面**\n${boardText(s.board)}`:s.chess?`\n\n**最終盤面**\n${chessText(s.chess,0,true)}`:s.mines?`\n\n${minesInfo(s.mines)}\n${minesText(s.mines,true)}`:''}`;
  else if(s.chess) {
    const game=s.chess,all=game.selected?game.destinations():game.pieces();
    s.page=Math.max(0,Math.min(s.page,Math.ceil(all.length/chessMovesPerPage)-1));
    const selected=game.selected?game.engine.get(game.selected):undefined;
    const stage=game.promotion?'**③ 昇格する駒を選ぶ**':game.selected?`**② 移動先を選ぶ** · **${game.selected} ${selected?pieceNames[selected.type]:''}**\n移動できるマス **${all.length}か所**`:`**① 動かす駒を選ぶ**\n動かせる駒 **${all.length}個** · 合法手 **${game.moves().length}通り**`;
    const initial=game.engine.fen().startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ');
    body=`⚪ **白** <@${s.players[0]}> · ⚫ **黒** <@${s.players[1]}>\n\n${stage}\n\n${chessText(game,s.page)}\n\n**<@${s.players[game.turn-1]}> の番です**${game.engine.isCheck()?' · **チェック！ 王を守る手だけ選べます。**':''}\n-# 🟦 選択中 · 🟩 移動先 · 🟥 駒取り / チェック\n-# 移動先は緑の数字・英字、駒取りは赤いマスと同じ座標のボタンで選べます。${all.length>chessMovesPerPage?` 候補 ${s.page*chessMovesPerPage+1}〜${Math.min((s.page+1)*chessMovesPerPage,all.length)} / ${all.length} · 次の候補もあります。`:''}${initial?'\n-# 開始直後に動けるのはポーン8個とナイト2個です。':''}${game.lastMove?`\n-# 直前の手: ${game.lastMove.from} → ${game.lastMove.to} · ${game.lastMove.san}`:''}${game.drawOffer?`\n-# <@${game.drawOffer}> が引き分けを提案しています。相手が同意すると終了します。次の着手で取り消されます。`:''}\n-# 手番の期限 <t:${Math.floor(s.expires/1000)}:R>`;
    body=body.replace('次の着手で取り消されます。','提案者の着手後も有効です。相手の着手・拒否で取り消されます。');
    if(game.claiming)body=body.replace(stage,`**引き分けを申告する手を選ぶ**\n${stage}\n-# 条件を満たす予定手だけ表示します。駒は動かさず対局を終了します。`);
    if(s.chessClock) {
      const c=s.chessClock,tc=chessTimeControls[c.control],now=Date.now();
      body=body.replace(/-# 手番の期限 <t:\d+:R>/,`**残り時間** · 白 **${clockText(c.left(1,now))}** ／ 黒 **${clockText(c.left(2,now))}**\n-# 各${tc.minutes}分${tc.increment?`・着手完了ごとに${tc.increment}秒加算`:''} · 手番の時間切れ <t:${Math.floor(c.deadline()/1000)}:R>\n-# 残り時間は画面更新時点の値です。`);
    }
    controls.push(...chessControls(game,s.page,a=>gameActionId(s,a)));
  } else if(s.mines) {
    const game=s.mines;
    body=`<@${s.host}> のひとり用ゲーム\n${minesInfo(game)}\n\n${minesText(game)}\n\n**${game.mode==='open'?`${emoji('ms_a')||'⛏️'} マスを開く`:`${emoji('ms_f')||'🚩'} 旗を立てる・外す`}**${game.selectedRow!==undefined?` · **${boardLabel(game.selectedRow+1)}行**を選択中`:''}\n**${game.selectedRow===undefined?'① 行を選ぶ':'② マスを選ぶ'}** · 座標と同じボタンを押します。\n-# 数字＝周囲の地雷数。初手と周囲8マスは安全。\n-# 旗がそろうと「周囲を開く」。誤った旗に注意。\n-# 最終操作から10分で終了 <t:${Math.floor(s.expires/1000)}:R>`;
    controls.push(...minesControls(game,a=>gameActionId(s,a)));
  }
  else if(s.board) {
    if(s.board instanceof Othello)s.page=Math.max(0,Math.min(s.page,Math.ceil(s.board.moves().length/movesPerPage)-1));
    const players=await Promise.all(s.players.map(async(p,i)=>`${emoji(s.kind==='othello'?(i===0?'o2':'o1'):(i===0?'4_1':'4_2'))} <@${p}> · **${formatAmount(await balance(p))}pt**`));
    body=`${players.join('\n')}\n\n${boardText(s.board,s.page)}\n\n${s.board instanceof Othello?`**スコア** · ${emoji('o2')} **${s.board.score()[0]}** − ${emoji('o1')} **${s.board.score()[1]}**\n`:''}${emoji('status_info')} **<@${s.players[s.board.turn-1]}> の番です**${s.board instanceof Othello&&s.board.passed?'\n-# 相手は置ける場所がないためパスしました。':''}\n-# ${s.board instanceof Othello?'盤面の数字・文字と同じボタンで石を置きます。':'盤面下の数字と同じ列にコマを落とします。'}\n-# 手番の期限 <t:${Math.floor(s.expires/1000)}:R>`;
    if(s.board instanceof Othello) {
      const all=s.board.moves();const pages=Math.ceil(all.length/movesPerPage);const candidates=all.slice(s.page*movesPerPage,(s.page+1)*movesPerPage);
      for(let start=0;start<candidates.length;start+=5)controls.push(row(...candidates.slice(start,start+5).map((m,index)=>button(gameActionId(s,`place${m.row},${m.col}`),markerLabel(start+index),ButtonStyle.Secondary,emoji(markerName(start+index))))));
      const navigation=pages>1?[button(gameActionId(s,'prev'),'前の候補',ButtonStyle.Secondary,undefined,s.page===0),button(gameActionId(s,'next'),`次の候補 (${s.page+1}/${pages})`,ButtonStyle.Secondary,undefined,s.page===pages-1)]:[];
      controls.push(row(...navigation,button(gameActionId(s,'leave'),'投了する',ButtonStyle.Secondary,emoji('status_warning'))));
    } else {
      for(const cols of [[0,1,2,3],[4,5,6]]) controls.push(row(...cols.map(c=>button(gameActionId(s,`col${c}`),`${c+1}列`,ButtonStyle.Primary,emoji(`b_${c+1}`),!s.board!.board[0]||s.board!.board[0]![c]!==0))));
      controls.push(row(button(gameActionId(s,'leave'),'投了する',ButtonStyle.Secondary,emoji('status_warning'))));
    }
  } else {
    body=`${s.players.map(p=>`${emoji(s.hands[p]?'status_success':'status_pending')} <@${p}> · **${s.hands[p]?'選択済み':'選択待ち'}**`).join('\n')}\n\n${s.kind==='highlow'?`**現在のカード** · **${cardLabel(s.currentCard)}**\n**賭け金** · **${formatAmount(s.bet)}pt / 人**\n次のカードが **High** か **Low** かを選んでください。\n-# 同じ数字は引き直します。\n-# 単独正解 · 賭け金の **2倍** ／ 両者正解 · 返金 ／ 両者不正解 · 没収`:'**グー・チョキ・パー** から選んでください。\n-# 手は両者が選ぶまで公開されません。'}\n-# 選択期限 <t:${Math.floor(s.expires/1000)}:R>`;
    controls.push(s.kind==='janken'?row(...(Object.entries(handEmojis) as [Hand,string][]).map(([h,e])=>button(gameActionId(s,h),h==='rock'?'グー':h==='scissors'?'チョキ':'パー',ButtonStyle.Primary,e))):row(button(gameActionId(s,'high'),'HIGH',ButtonStyle.Primary,'⬆️'),button(gameActionId(s,'low'),'LOW',ButtonStyle.Secondary,'⬇️')));
    controls.push(row(button(gameActionId(s,'leave'),'対戦を終了',ButtonStyle.Secondary)));
  }
  if(s.phase==='finished') {
    controls.push(row(button(`replay:${s.id}`,s.kind==='minesweeper'?'もう一度遊ぶ':'もう一度募集する',ButtonStyle.Primary,emoji('status_pending'))));
  }
  const accent=s.board?(s.kind==='othello'?(s.phase==='finished'?0x607d8b:0x2ecc71):(s.phase==='finished'?(s.board.winner===0?0x979c9f:0xf1c40f):0x3498db)):(s.phase==='finished'&&s.kind==='janken'&&['success','info'].includes(s.resultStatus??'success')?0xf1c40f:undefined);
  const result=card(`${gameNames[s.kind]}${s.kind==='othello'?` (${s.size}×${s.size})`:''}${s.phase==='finished'?' · 結果':s.kind==='minesweeper'&&s.phase==='recruiting'?' · 難易度選択':''}`,body,s.phase==='finished'?(s.resultStatus??'success'):s.phase==='recruiting'?'pending':'info',controls,`${s.kind==='minesweeper'?'ゲーム':'対戦'} #${s.id.slice(0,8)}`,undefined,undefined,accent,{repeatEmojis:s.kind==='chess'||s.kind==='minesweeper'});
  return {...result,files:[],attachments:[]};
}
