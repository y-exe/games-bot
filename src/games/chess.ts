import { Chess, type Move, type Square, type PieceSymbol, type Color } from 'chess.js';
import { UserError } from '../errors.js';
import type { Player, Stone } from './board.js';
import {canPossiblyMate,isDeadPosition} from './chess-material.js';

export const pieceNames: Record<PieceSymbol,string> = {k:'キング',q:'クイーン',r:'ルーク',b:'ビショップ',n:'ナイト',p:'ポーン'};
export const promotions = ['q','r','b','n'] as const;
export class ChessGame {
  readonly kind = 'chess';
  #engine: Chess;
  #positions=new Map<string,number>();
  #reason='';
  #claimCache?:{key:string;moves:Move[]};
  winner: Stone|null = null;
  selected?: Square;
  promotion?: Square;
  claiming=false;
  drawOffer?: string;
  drawOfferColor?:Color;
  constructor(fen?:string) {this.#engine=new Chess(fen);this.#positions.set(this.positionKey(),1);}
  private positionKey() {return this.#engine.fen().split(' ').slice(0,4).join(' ');}
  get engine() { return this.#engine; }
  get turn():Player { return this.#engine.turn()==='w'?1:2; }
  get lastMove() { return this.#engine.history({verbose:true}).at(-1); }
  moves():Move[] { return this.#engine.moves({verbose:true}); }
  private choices() {return this.claiming?this.claimMoves():this.moves();}
  pieces():Square[] { return [...new Set(this.choices().map(m=>m.from))]; }
  destinations():Square[] { return [...new Set(this.choices().filter(m=>m.from===this.selected).map(m=>m.to))]; }
  select(square:string) {
    if(this.winner!==null||!this.pieces().includes(square as Square))throw new UserError('動かせる駒を選んでください。');
    this.selected=square as Square;this.promotion=undefined;
  }
  claimReason(move?:Pick<Move,'from'|'to'|'promotion'>):string {
    if(move)this.#engine.move(move);
    try {
      if((this.#positions.get(this.positionKey())??0)+(move?1:0)>=3)return '3回の同一局面反復';
      if(this.#engine.isDrawByFiftyMoves())return '50手ルール';
      return '';
    } finally {if(move)this.#engine.undo();}
  }
  claimMoves():Move[] {
    const key=this.#engine.fen();
    if(this.#claimCache?.key===key)return this.#claimCache.moves;
    const possible=Number(key.split(' ')[4])>=99||[...this.#positions.values()].some(n=>n>=2);
    const moves=possible?this.moves().filter(move=>Boolean(this.claimReason(move))):[];
    this.#claimCache={key,moves};return moves;
  }
  canClaim() {return Boolean(this.claimReason())||this.claimMoves().length>0;}
  claimDraw(move?:Pick<Move,'from'|'to'|'promotion'>) {
    if(this.winner!==null)throw new UserError('この対戦は終了しています。');
    const reason=this.claimReason(move);
    if(!reason)throw new UserError('現在の局面・予定手では引き分けを申告できません。');
    this.finishDraw(`${reason}の申告${move?`（予定手 ${move.from} → ${move.to}）`:''}`);
  }
  finishDraw(reason:string) {this.winner=0;this.#reason=reason;this.claiming=false;}
  offerDraw(userId:string,color:Color) {
    if(this.drawOffer)throw new UserError('すでに引き分けが提案されています。');
    this.drawOffer=userId;this.drawOfferColor=color;
  }
  declineDraw() {this.drawOffer=undefined;this.drawOfferColor=undefined;}
  private adjudicate() {
    if(this.#engine.isCheckmate()) {this.winner=this.turn===1?2:1;this.#reason='チェックメイト';}
    else if(this.#engine.isStalemate())this.finishDraw('ステイルメイト');
    else if(isDeadPosition(this.#engine))this.finishDraw('デッドポジション（詰みが不可能）');
    else if((this.#positions.get(this.positionKey())??0)>=5)this.finishDraw('5回の同一局面反復');
    else if(Number(this.#engine.fen().split(' ')[4])>=150)this.finishDraw('75手ルール');
  }
  lose(player:Player,reason:'時間切れ'|'投了') {
    const winner=player===1?2:1;
    if(canPossiblyMate(this.#engine,winner===1?'w':'b')) {this.winner=winner;this.#reason=reason;}
    else this.finishDraw(`${reason}・相手に詰ませる手段がないため引き分け`);
  }
  play(square:string,promotion?:string) {
    if(this.winner!==null||!this.selected)throw new UserError('先に動かす駒を選んでください。');
    const moves=this.choices().filter(m=>m.from===this.selected&&m.to===square);
    if(!moves.length)throw new UserError('そのマスへは移動できません。');
    if(moves.some(m=>m.promotion)&&!promotion) {this.promotion=square as Square;return false;}
    if(promotion&&!moves.some(m=>m.promotion===promotion))throw new UserError('昇格先を選び直してください。');
    const move=moves.find(m=>!m.promotion||m.promotion===promotion)!;
    if(this.claiming) {this.claimDraw(move);return false;}
    const color=this.#engine.turn();
    this.#engine.move({from:this.selected,to:square,promotion});
    const key=this.positionKey();this.#positions.set(key,(this.#positions.get(key)??0)+1);this.#claimCache=undefined;
    this.selected=undefined;this.promotion=undefined;
    if(this.drawOfferColor!==color)this.declineDraw();
    this.adjudicate();return true;
  }
  ending() {return this.#reason;}
  toJSON() {return {kind:this.kind,pgn:this.#engine.pgn(),winner:this.winner,selected:this.selected,promotion:this.promotion,drawOffer:this.drawOffer,drawOfferColor:this.drawOfferColor,claiming:this.claiming,reason:this.#reason};}
}
