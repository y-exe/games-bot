import {UserError} from '../errors.js';
export type Stone = 0 | 1 | 2;
export type Player = 1 | 2;
export interface Move { row: number; col: number }
const directions = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]] as const;
export const other = (p: Player): Player => p === 1 ? 2 : 1;

export class Othello {
  readonly kind = 'othello';
  board: Stone[][];
  turn: Player = 1;
  winner: Stone | null = null;
  passed = false;
  constructor(readonly size: number = 8) {
    if (![6,8,10].includes(size)) throw new UserError('盤面は6・8・10から選んでください。');
    this.board = Array.from({ length: size }, () => Array<Stone>(size).fill(0));
    const m = size / 2;
    this.board[m-1]![m-1] = this.board[m]![m] = 2;
    this.board[m-1]![m] = this.board[m]![m-1] = 1;
  }
  flips(row: number, col: number, player: Player = this.turn): Move[] {
    if (this.board[row]?.[col] !== 0) return [];
    const result: Move[] = [];
    for (const [dr, dc] of directions) {
      let r = row + dr, c = col + dc; const line: Move[] = [];
      while (this.board[r]?.[c] === other(player)) { line.push({ row: r, col: c }); r += dr; c += dc; }
      if (this.board[r]?.[c] === player) result.push(...line);
    }
    return result;
  }
  moves(player: Player = this.turn): Move[] {
    const result: Move[] = [];
    for (let row = 0; row < this.size; row++) for (let col = 0; col < this.size; col++) {
      if (this.flips(row,col,player).length) result.push({ row,col });
    }
    return result;
  }
  play(row: number, col: number) {
    if (this.winner !== null) throw new UserError('この対戦は終了しています。');
    const flips = this.flips(row,col);
    if (!flips.length) throw new UserError('そこには置けません。候補から選んでください。');
    this.board[row]![col] = this.turn;
    for (const cell of flips) this.board[cell.row]![cell.col] = this.turn;
    this.turn = other(this.turn); this.passed = false;
    if (!this.moves().length) {
      this.turn = other(this.turn); this.passed = true;
      if (!this.moves().length) { const [b,w] = this.score(); this.winner = b === w ? 0 : b > w ? 1 : 2; }
    }
  }
  score(): [number,number] { return [this.board.flat().filter(s=>s===1).length, this.board.flat().filter(s=>s===2).length]; }
  botMove() {
    return this.moves().sort((a,b) => this.moveValue(b) - this.moveValue(a))[0];
  }
  private moveValue(m: Move) {
    const edge = (n: number) => n === 0 || n === this.size - 1;
    const corner = edge(m.row) && edge(m.col);
    const nextToCorner = [1,this.size-2].includes(m.row) && [1,this.size-2].includes(m.col);
    return (corner ? 1000 : 0) + (edge(m.row)||edge(m.col) ? 30 : 0) - (nextToCorner ? 100 : 0) + this.flips(m.row,m.col).length;
  }
}

export class ConnectFour {
  readonly kind = 'connectfour';
  board: Stone[][] = Array.from({ length: 6 }, () => Array<Stone>(7).fill(0));
  turn: Player = 1;
  winner: Stone | null = null;
  moves() { return [0,1,2,3,4,5,6].filter(c=>this.board[0]![c]===0); }
  play(col: number) {
    if (this.winner !== null) throw new UserError('この対戦は終了しています。');
    if (!Number.isInteger(col) || !this.moves().includes(col)) throw new UserError('この列には置けません。');
    for (let r = 5; r >= 0; r--) if (this.board[r]![col] === 0) { this.board[r]![col] = this.turn; break; }
    if (this.hasWon(this.turn)) this.winner = this.turn;
    else if (!this.moves().length) this.winner = 0;
    else this.turn = other(this.turn);
  }
  hasWon(p: Player, board = this.board) {
    for (let r=0; r<6; r++) for (let c=0;c<7;c++) for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      if ([0,1,2,3].every(i=>board[r+dr!*i]?.[c+dc!*i]===p)) return true;
    }
    return false;
  }
  botMove() {
    const centerOrder = [3,4,2,5,1,6,0].filter(c=>this.board[0]![c]===0);
    if (!centerOrder.length) return undefined;
    const me = this.turn, foe = other(me);
    // 1. 即勝ち
    for (const c of centerOrder) {
      const b = this.drop(this.board,c,me);
      if (b && this.hasWon(me,b)) return c;
    }
    // 2. 相手の即勝ち阻止
    for (const c of centerOrder) {
      const b = this.drop(this.board,c,foe);
      if (b && this.hasWon(foe,b)) return c;
    }
    // 3. 自分のフォーク(次手で即勝ちが2列できる形)を狙う
    for (const c of centerOrder) {
      const b = this.drop(this.board,c,me);
      if (b && this.threatCount(b,foe)===0 && this.threatCount(b,me)>=2) return c;
    }
    // 4. 相手に即勝ち・フォークの両方を許さない手を中央寄りで選ぶ
    const safe = centerOrder.find(c=>{
      const b = this.drop(this.board,c,me);
      if (!b || this.threatCount(b,foe)>0) return false;
      return !this.freeCols(b).some(d=>{
        const b2 = this.drop(b,d,foe);
        return b2 && this.hasWon(foe,b2) && this.threatCount(b2,foe)>=2;
      });
    });
    return safe ?? centerOrder[0];
  }
  private drop(board: Stone[][], col: number, p: Stone) {
    for (let r=5;r>=0;r--) if (board[r]![col]===0) {
      const copy = board.map(row=>[...row]);
      copy[r]![col] = p;
      return copy;
    }
    return null;
  }
  private freeCols(board: Stone[][]) {
    return [0,1,2,3,4,5,6].filter(c=>board[0]![c]===0);
  }
  private threatCount(board: Stone[][], p: Player) {
    return this.freeCols(board).filter(c=>{
      const b = this.drop(board,c,p);
      return b && this.hasWon(p,b);
    }).length;
  }
}
