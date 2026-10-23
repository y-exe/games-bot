import {Chess,type Move,type PieceSymbol} from 'chess.js';
import {isDeadPosition} from './chess-material.js';

export interface ChessBotMove {from:string;to:string;promotion?:string}
const values:Record<PieceSymbol,number>={p:100,n:320,b:330,r:500,q:900,k:0};
const mate=1_000_000;
function evaluate(game:Chess) {
  let score=0;
  for(const [r,rank] of game.board().entries())for(const [c,piece] of rank.entries())if(piece) {
    const center=7-Math.abs(3.5-r)-Math.abs(3.5-c);
    const advance=piece.color==='w'?6-r:r-1;
    const position=piece.type==='p'?advance*8+center*3:piece.type==='n'||piece.type==='b'?center*10:piece.type==='k'?-center*5:center*2;
    score+=(values[piece.type]+position)*(piece.color==='w'?1:-1);
  }
  return score*(game.turn()==='w'?1:-1);
}
function order(move:Move) {return (move.captured?values[move.captured]*10-values[move.piece]:0)+(move.promotion?values[move.promotion]:0)+(move.san.includes('+')?40:0);}

export function chooseChessMove(fen:string,maxNodes=2500,maxMs=750):ChessBotMove|undefined {
  const game=new Chess(fen);
  if(game.isCheckmate()||game.isStalemate()||isDeadPosition(game)||Number(game.fen().split(' ')[4])>=150)return;
  const legal=game.moves({verbose:true}).sort((a,b)=>order(b)-order(a));
  let best=legal[0]!,nodes=0;
  const deadline=performance.now()+maxMs,exhausted=Symbol('search budget');
  function search(depth:number,alpha:number,beta:number,ply:number):number {
    if(++nodes>maxNodes||performance.now()>=deadline)throw exhausted;
    if(game.isCheckmate())return -mate+ply;
    if(game.isStalemate()||isDeadPosition(game)||Number(game.fen().split(' ')[4])>=150)return 0;
    if(depth===0)return evaluate(game);
    let score=-Infinity;
    for(const move of game.moves({verbose:true}).sort((a,b)=>order(b)-order(a))) {
      game.move(move);
      let value:number;
      try {value=-search(depth-1,-beta,-alpha,ply+1);} finally {game.undo();}
      score=Math.max(score,value);alpha=Math.max(alpha,value);
      if(alpha>=beta)break;
    }
    return score;
  }
  for(let depth=1;depth<=3;depth++) {
    let candidate=best,score=-Infinity,alpha=-Infinity;
    try {
      for(const move of [best,...legal.filter(m=>m!==best)]) {
        game.move(move);
        let value:number;
        try {value=-search(depth-1,-Infinity,-alpha,1);} finally {game.undo();}
        if(value>score) {score=value;candidate=move;}
        alpha=Math.max(alpha,value);
      }
      best=candidate;
      if(score>=mate-3)break;
    } catch(error) {if(error!==exhausted)throw error;break;}
  }
  return {from:best.from,to:best.to,...(best.promotion?{promotion:best.promotion}:{})};
}
export function shouldAcceptChessDraw(fen:string,color:'w'|'b',plies:number) {
  const game=new Chess(fen),score=evaluate(game)*(game.turn()===color?1:-1);
  return score<=-150||(plies>=40&&Math.abs(score)<=100);
}
