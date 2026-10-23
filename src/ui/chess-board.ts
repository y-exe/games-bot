import {ButtonStyle} from 'discord.js';
import {pieceNames,promotions,type ChessGame} from '../games/chess.js';
import {emoji} from './emojis.js';
import {button,row,type CardRow} from './cards.js';
import {boardLabel,boardLabelEmoji} from './board-labels.js';

export const chessMovesPerPage=20;

export function chessCells(game:ChessGame,finished=false) {
  const moves=finished?[]:game.moves().filter(m=>m.from===game.selected);
  const destinations=new Map(moves.map(m=>[m.to,m]));
  const check=!finished&&game.engine.isCheck();
  return game.engine.board().map((rank,r)=>rank.map((piece,c)=>{
    const square=`${'abcdefgh'[c]}${8-r}`;
    const move=destinations.get(square as typeof moves[number]['to']);
    const state=finished?'':square===game.selected?'s':piece?.type==='k'&&piece.color===game.engine.turn()&&check?'c':move?(move.captured&&!piece?'t':'m'):'';
    return {square,piece,state,emojiName:`c_${piece?piece.color+piece.type:'empty'}_${(r+c)%2}${state?`_${state}`:''}`};
  }));
}
export function chessText(game:ChessGame,page=0,finished=false) {
  const symbols={w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
  const choices=finished?[]:game.destinations().slice(page*chessMovesPerPage,(page+1)*chessMovesPerPage);
  const lines=chessCells(game,finished).map((rank,r)=>`${emoji(`b_${8-r}`)}${rank.map(({square,piece,emojiName,state},c)=>{
    const index=choices.indexOf(square as typeof choices[number]);
    if(state==='m'||state==='t') {
      if(index<0)emojiName=`c_${piece?piece.color+piece.type:'empty'}_${(r+c)%2}`;
      else if(!piece)return emoji(boardLabelEmoji(index+1,state==='t'?'red':'green'))||boardLabel(index+1);
    }
    return emoji(emojiName)||(piece?symbols[piece.color][piece.type]:(r+c)%2?'◻️':'⬜');
  }).join('')}`);
  lines.push(`${emoji('board_spacer')}${[...'ABCDEFGH'].map(c=>emoji(`b_${c}`)).join('')}`);
  return lines.join('\n');
}
export function chessControls(game:ChessGame,page:number,id:(action:string)=>string,allowDraw=true) {
  const controls:CardRow[]=[];
  if(game.promotion)controls.push(row(...promotions.map(p=>button(id(`promote${p}`),pieceNames[p],ButtonStyle.Primary,emoji(`c_${game.engine.turn()}${p}_0`)))));
  else {
    const all=game.selected?game.destinations():game.pieces();
    const candidates=all.slice(page*chessMovesPerPage,(page+1)*chessMovesPerPage);
    for(let start=0;start<candidates.length;start+=5)controls.push(row(...candidates.slice(start,start+5).map((square,i)=>{
      const piece=game.engine.get(square),move=game.selected?game.moves().find(m=>m.from===game.selected&&m.to===square):undefined;
      const capture=move?.captured;
      const castle=move?.isKingsideCastle()||move?.isQueensideCastle();
      const index=start+i+1;
      const label=game.selected?`${boardLabel(index)} · ${square}${capture?` · ${pieceNames[capture]}を取る`:castle?' · キャスリング':' へ移動'}`:`${square} · ${piece?pieceNames[piece.type]:''}`;
      const icon=game.selected?(piece?emoji(`c_${piece.color+piece.type}_0_m`):emoji(boardLabelEmoji(index,capture?'red':'green'))):piece?emoji(`c_${piece.color+piece.type}_0`):undefined;
      return button(id(`${game.selected?'to':'piece'}${square}`),label,game.selected?(capture?ButtonStyle.Danger:ButtonStyle.Success):ButtonStyle.Secondary,icon);
    })));
    const pages=Math.ceil(all.length/chessMovesPerPage);
    if(pages>1)controls.push(row(button(id('prev'),'前の候補',ButtonStyle.Secondary,undefined,page===0),button(id('next'),`次の候補 (${page+1}/${pages})`,ButtonStyle.Secondary,undefined,page===pages-1)));
  }
  controls.push(row(
    ...(game.selected?[button(id('back'),'① 駒を選び直す',ButtonStyle.Primary)]:[]),
    ...(game.claiming?[button(id('cancelclaim'),'申告をやめる',ButtonStyle.Secondary)]:game.canClaim()?[button(id('claim'),'引き分けを申告',ButtonStyle.Secondary)]:[]),
    ...(allowDraw?[button(id('draw'),game.drawOffer?'引き分けに同意':'引き分けを提案',ButtonStyle.Secondary)]:[]),
    ...(game.drawOffer?[button(id('declinedraw'),'提案を断る',ButtonStyle.Secondary)]:[]),
    button(id('leave'),'投了する',ButtonStyle.Secondary,emoji('status_warning'))));
  return controls;
}
