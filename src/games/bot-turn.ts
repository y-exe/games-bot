import {randomInt} from 'node:crypto';
import {UserError} from '../errors.js';
import {Othello} from './board.js';
import {chessBotMove} from './chess-bot.js';
import type {Session} from './session.js';

export async function playBotTurn(s:Session,bot:string) {
  if(s.chess&&s.chess.winner===null&&s.players[s.chess.turn-1]===bot) {
    const game=s.chess;
    if(s.chessClock?.expired()) {game.lose(game.turn,'時間切れ');return;}
    if(game.canClaim()) {
      const move=game.claimReason()?undefined:game.claimMoves()[0];
      game.claimDraw(move);return;
    }
    const candidate=await chessBotMove(game.engine.fen());
    const movedAt=Date.now();
    if(s.chessClock?.expired(movedAt)) {game.lose(game.turn,'時間切れ');return;}
    const legal=game.moves();
    const move=legal.find(m=>m.from===candidate?.from&&m.to===candidate.to&&m.promotion===candidate.promotion)??legal[0];
    if(!move)throw new UserError('Botの合法手が見つかりませんでした。');
    const mover=game.turn;
    game.select(move.from);game.play(move.to,move.promotion);s.chessClock?.move(mover,movedAt);s.page=0;
    if(s.chessClock)s.expires=s.chessClock.deadline();
  }
  else if(s.board)while(s.board.winner===null&&s.players[s.board.turn-1]===bot) {
    if(s.board instanceof Othello){const m=s.board.botMove();if(!m)break;s.board.play(m.row,m.col);}else{const c=s.board.botMove();if(c===undefined)break;s.board.play(c);}
  }
  else if(s.kind==='janken'&&s.players.includes(bot))s.hands[bot]=(['rock','scissors','paper'] as const)[randomInt(3)]!;
}
