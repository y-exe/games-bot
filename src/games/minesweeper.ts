import { randomInt } from 'node:crypto';
import { UserError } from '../errors.js';

export const mineLevels = {
  easy:{label:'初級',size:6,mines:6,reward:60n},
  normal:{label:'中級',size:8,mines:10,reward:120n},
  hard:{label:'上級',size:10,mines:20,reward:220n},
} as const;
export type MineLevel = keyof typeof mineLevels;
export function mineLevel(input:string):MineLevel {
  const aliases:Record<string,MineLevel>={easy:'easy',normal:'normal',hard:'hard',初級:'easy',中級:'normal',上級:'hard'};
  const result=aliases[input.toLowerCase()];
  if(!result)throw new UserError('難易度は `easy`（初級）・`normal`（中級）・`hard`（上級）から選んでください。');
  return result;
}
export class Minesweeper {
  readonly kind='minesweeper';
  readonly size:number;
  readonly mineCount:number;
  mines:boolean[][];
  opened:boolean[][];
  flags:boolean[][];
  planted=false;
  outcome:'won'|'lost'|null=null;
  mode:'open'|'flag'='open';
  selectedRow?:number;
  constructor(readonly level:MineLevel='normal') {
    const spec=mineLevels[level];this.size=spec.size;this.mineCount=spec.mines;
    this.mines=this.grid();this.opened=this.grid();this.flags=this.grid();
  }
  private grid() { return Array.from({length:this.size},()=>Array<boolean>(this.size).fill(false)); }
  private check(r:number,c:number) {
    if(!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=this.size||c>=this.size)throw new UserError('盤面内のマスを選んでください。');
    if(this.outcome)throw new UserError('このゲームは終了しています。');
  }
  neighbors(r:number,c:number) {
    const result:{row:number;col:number}[]=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if((dr||dc)&&r+dr>=0&&r+dr<this.size&&c+dc>=0&&c+dc<this.size)result.push({row:r+dr,col:c+dc});
    return result;
  }
  count(r:number,c:number) { return this.neighbors(r,c).filter(m=>this.mines[m.row]![m.col]).length; }
  get flagCount() { return this.flags.flat().filter(Boolean).length; }
  get openCount() { return this.opened.reduce((total,rank,r)=>total+rank.filter((open,c)=>open&&!this.mines[r]![c]).length,0); }
  private plant(r:number,c:number) {
    const safe=new Set([`${r},${c}`,...this.neighbors(r,c).map(m=>`${m.row},${m.col}`)]);
    const cells=Array.from({length:this.size*this.size},(_,n)=>({row:Math.floor(n/this.size),col:n%this.size})).filter(m=>!safe.has(`${m.row},${m.col}`));
    for(let i=0;i<this.mineCount;i++) {
      const index=randomInt(i,cells.length);[cells[i],cells[index]]=[cells[index]!,cells[i]!];
      const m=cells[i]!;this.mines[m.row]![m.col]=true;
    }
    this.planted=true;
  }
  flag(r:number,c:number) {
    this.check(r,c);
    if(this.opened[r]![c])throw new UserError('開いたマスには旗を立てられません。');
    if(!this.flags[r]![c]&&this.flagCount>=this.mineCount)throw new UserError('旗は地雷の数まで立てられます。先に別の旗を外してください。');
    this.flags[r]![c]=!this.flags[r]![c];
  }
  open(r:number,c:number) {
    this.check(r,c);
    if(this.flags[r]![c])throw new UserError('旗を外してから開いてください。');
    if(!this.planted)this.plant(r,c);
    if(this.opened[r]![c]) {
      const adjacent=this.neighbors(r,c),number=this.count(r,c);
      if(!number||adjacent.filter(m=>this.flags[m.row]![m.col]).length!==number)throw new UserError('周囲の旗の数を、このマスの数字と一致させてください。');
      for(const m of adjacent)if(!this.flags[m.row]![m.col]&&!this.opened[m.row]![m.col])this.reveal(m.row,m.col);
    } else this.reveal(r,c);
    if(this.outcome!=='lost'&&this.openCount===this.size*this.size-this.mineCount)this.outcome='won';
  }
  private reveal(r:number,c:number) {
    const queue=[{row:r,col:c}];
    while(queue.length&&this.outcome!=='lost') {
      const m=queue.pop()!;
      if(this.opened[m.row]![m.col]||this.flags[m.row]![m.col])continue;
      this.opened[m.row]![m.col]=true;
      if(this.mines[m.row]![m.col]) {this.outcome='lost';return;}
      if(this.count(m.row,m.col)===0)queue.push(...this.neighbors(m.row,m.col));
    }
  }
}
