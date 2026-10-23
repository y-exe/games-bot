import type {Player} from './board.js';

export const chessTimeControls={
  '5+0':{minutes:5,increment:0},
  '10+5':{minutes:10,increment:5},
  '15+10':{minutes:15,increment:10},
  '30+0':{minutes:30,increment:0},
} as const;
export type ChessTimeControl=keyof typeof chessTimeControls;
export class ChessClock {
  remaining:[number,number];
  startedAt:number;
  turn:Player;
  constructor(readonly control:ChessTimeControl='10+5',turn:Player=1,now=Date.now()) {
    const initial=chessTimeControls[control].minutes*60_000;
    this.remaining=[initial,initial];this.turn=turn;this.startedAt=now;
  }
  left(player:Player,now=Date.now()) {return Math.max(0,this.remaining[player-1]!-(player===this.turn?Math.max(0,now-this.startedAt):0));}
  deadline() {return this.startedAt+this.remaining[this.turn-1]!;}
  expired(now=Date.now()) {return now>=this.deadline();}
  move(player:Player,now=Date.now()) {
    if(player!==this.turn||this.expired(now))throw new Error('チェス時計の手番または残り時間が一致しません。');
    this.remaining[player-1]=this.left(player,now)+chessTimeControls[this.control].increment*1000;
    this.turn=player===1?2:1;this.startedAt=now;
  }
}
export function clockText(ms:number) {
  const seconds=Math.ceil(ms/1000);
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
