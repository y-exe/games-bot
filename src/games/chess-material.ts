import type {Chess,Color} from 'chess.js';

export function frozenPawnPosition(game:Chess):boolean {
  const board=game.board(),pieces=board.flat().filter(p=>p!==null);
  const pawns=pieces.filter(p=>p.type==='p');
  if(!pawns.length||pieces.some(p=>p.type!=='k'&&p.type!=='p')||game.isCheck()||game.fen().split(' ')[3]!=='-')return false;
  const at=(r:number,c:number)=>board[r]?.[c];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++) {
    const p=at(r,c);if(p?.type!=='p')continue;
    const next=r+(p.color==='w'?-1:1);
    if(at(next,c)?.type!=='p'||[-1,1].some(dc=>at(next,c+dc)?.color===(p.color==='w'?'b':'w')))return false;
  }
  for(const color of ['w','b'] as const) {
    const enemy=color==='w'?'b':'w',attacked=new Set<number>();
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(at(r,c)?.type==='p'&&at(r,c)?.color===enemy)
      for(const dc of [-1,1])if(c+dc>=0&&c+dc<8)attacked.add((r+(enemy==='w'?-1:1))*8+c+dc);
    const king=pieces.find(p=>p.type==='k'&&p.color===color)!;
    const start=(8-Number(king.square[1]))*8+king.square.charCodeAt(0)-97,queue=[start],seen=new Set(queue);
    for(let i=0;i<queue.length;i++) {
      const square=queue[i]!,r=Math.floor(square/8),c=square%8;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) {
        const nr=r+dr,nc=c+dc,n=nr*8+nc;
        if(nr<0||nr>7||nc<0||nc>7||seen.has(n)||attacked.has(n))continue;
        const target=at(nr,nc);
        if(target?.type==='p') {if(target.color===enemy)return false;continue;}
        seen.add(n);queue.push(n);
      }
    }
  }
  return true;
}
export function isDeadPosition(game:Chess) {return game.isInsufficientMaterial()||frozenPawnPosition(game);}
export function canPossiblyMate(game:Chess,color:Color):boolean {
  if(isDeadPosition(game))return false;
  const pieces=game.board().flat().filter(p=>p!==null),own=pieces.filter(p=>p.color===color&&p.type!=='k');
  if(!own.length)return false;
  if(own.some(p=>p.type==='p'||p.type==='r'||p.type==='q'))return true;
  const enemy=pieces.filter(p=>p.color!==color&&p.type!=='k');
  if(!enemy.length&&own.length===1)return false;
  return true;
}
