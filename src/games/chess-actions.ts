import {UserError} from '../errors.js';
import {shouldAcceptChessDraw} from './chess-ai.js';
import type {Session} from './session.js';

export function applyChessAction(s:Session,action:string,userId:string,botId:string,actionTime:number) {
  const game=s.chess!;
  let moved=false,botDeclined=false;
  if(action==='draw') {
    if(game.drawOffer===userId)throw new UserError('相手の同意を待っています。');
    if(game.drawOffer)game.finishDraw('引き分けに合意');
    else {
      game.offerDraw(userId,s.players.indexOf(userId)===0?'w':'b');
      if(s.players.includes(botId)) {
        const botColor=s.players[0]===botId?'w':'b';
        if(shouldAcceptChessDraw(game.engine.fen(),botColor,game.engine.history().length))game.finishDraw('Botが引き分けに合意');
        else {game.declineDraw();botDeclined=true;}
      }
    }
  } else if(action==='declinedraw') {
    if(!game.drawOffer||game.drawOffer===userId)throw new UserError('相手からの提案だけ断れます。');
    game.declineDraw();
  } else {
    if(s.players[game.turn-1]!==userId)throw new UserError('今は相手の番です。');
    const mover=game.turn;
    if(action==='claim') {
      if(game.claimReason())game.claimDraw();
      else if(game.claimMoves().length) {game.claiming=true;game.selected=undefined;game.promotion=undefined;s.page=0;}
      else throw new UserError('現在の局面では引き分けを申告できません。');
    } else if(action==='cancelclaim') {game.claiming=false;game.selected=undefined;game.promotion=undefined;s.page=0;}
    else if(action==='next'||action==='prev')s.page+=action==='next'?1:-1;
    else if(action==='back') {game.selected=undefined;game.promotion=undefined;s.page=0;}
    else if(/^piece[a-h][1-8]$/.test(action)) {game.select(action.slice(5));s.page=0;}
    else if(/^to[a-h][1-8]$/.test(action)) {moved=game.play(action.slice(2));s.page=0;}
    else if(/^promote[qrbn]$/.test(action)&&game.promotion) {moved=game.play(game.promotion,action.slice(7));s.page=0;}
    else throw new UserError('駒・移動先・昇格先のボタンから選んでください。');
    if(moved&&s.chessClock)s.chessClock.move(mover,actionTime);
  }
  if(s.chessClock)s.expires=s.chessClock.deadline();
  return {moved,botDeclined};
}
