import { Othello,ConnectFour } from '../games/board.js';
import { emoji } from './emojis.js';

export const movesPerPage=20;
export const markerName=(index:number)=>index<10?`${index}_o`:`o_${String.fromCharCode(65+index-10)}`;
export const markerLabel=(index:number)=>index<10?String(index):String.fromCharCode(65+index-10);
export function boardText(board:Othello|ConnectFour,page=0) {
  const markers=new Map<string,string>();
  if(board instanceof Othello&&board.winner===null) {
    board.moves().slice(page*movesPerPage,(page+1)*movesPerPage).forEach((m,index)=>markers.set(`${m.row},${m.col}`,emoji(markerName(index))));
  }
  const cells=board instanceof Othello?['o0','o2','o1']:['4_0','4_1','4_2'];
  const lines=board.board.map((line,r)=>line.map((stone,c)=>markers.get(`${r},${c}`)??emoji(cells[stone]!)).join(''));
  if(board instanceof ConnectFour)lines.push([1,2,3,4,5,6,7].map(n=>emoji(`${n}_o`)).join(''));
  return lines.join('\n');
}
