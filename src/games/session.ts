import type {Othello,ConnectFour} from './board.js';
import type {ChessGame} from './chess.js';
import type {Minesweeper} from './minesweeper.js';
import type {ChessClock,ChessTimeControl} from './chess-clock.js';
import type {Status} from '../ui/cards.js';
import type {handEmojis} from '../ui/emojis.js';
import {settings} from '../config.js';

export type GameKind = 'othello' | 'connectfour' | 'janken' | 'highlow' | 'chess' | 'minesweeper';
export type Hand = keyof typeof handEmojis;
export interface Session {
  id: string; kind: GameKind; host: string; target?: string; players: string[];
  phase: 'recruiting'|'playing'|'finished'; revision: number; expires: number;
  channelId: string; messageId: string; size: number; page: number;
  board?: Othello|ConnectFour; hands: Record<string,string>; currentCard: number;
  chess?:ChessGame; mines?:Minesweeper;
  chessClock?:ChessClock;timeControl?:ChessTimeControl;
  bet: string; escrow: boolean; result?: string; resultStatus?:Status;
}
export const gameNames: Record<GameKind,string> = {othello:'オセロ',connectfour:'四目並べ',janken:'じゃんけん',highlow:'ハイアンドロー',chess:'チェス',minesweeper:'マインスイーパー'};
export const recruitmentTimeout:Record<GameKind,number>={othello:300_000,connectfour:300_000,janken:180_000,highlow:120_000,chess:300_000,minesweeper:600_000};
export function playingTimeout(kind:GameKind){return kind==='minesweeper'?600_000:kind==='janken'||kind==='highlow'?60_000:settings.turnTimeoutMs;}

export function gameActionId(s:Session,action:string) {return `game:${s.id}:${s.revision}:${action}`;}
export function cardLabel(n:number) {return ({1:'A',11:'J',12:'Q',13:'K'} as Record<number,string>)[n]??String(n);}
