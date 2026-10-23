import {Worker} from 'node:worker_threads';
import type {ChessBotMove} from './chess-ai.js';

let active=0;
export function chessBotMove(fen:string):Promise<ChessBotMove|undefined> {
  if(active>=4)return Promise.resolve(undefined);
  return new Promise(resolve=>{
    let worker:Worker;
    try {worker=new Worker(new URL(import.meta.url.endsWith('.ts')?'./chess-worker.ts':'./chess-worker.js',import.meta.url),{workerData:{fen}});}
    catch {resolve(undefined);return;}
    active++;
    let done=false;
    const finish=(move?:ChessBotMove)=>{
      if(done)return;done=true;clearTimeout(timer);active--;void worker.terminate();resolve(move);
    };
    const timer=setTimeout(()=>finish(),5000);
    worker.once('message',(move:ChessBotMove|undefined)=>finish(move));
    worker.once('error',()=>finish());
    worker.once('exit',()=>finish());
  });
}
