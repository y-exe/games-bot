import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import type { MediaJob } from './media-worker.js';
export interface MediaResult {bytes:Buffer;template?:string;resized?:boolean}

export class MediaWorker {
  private worker?: Worker;
  private nextId=0;
  private pending=new Map<number,{resolve:(b:MediaResult)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
  run(job:MediaJob):Promise<Buffer> {
    return this.runDetailed(job).then(result=>result.bytes);
  }
  runDetailed(job:MediaJob):Promise<MediaResult> {
    if(this.pending.size>=4)return Promise.reject(new Error('画像処理が混み合っています。少し待ってから再試行してください。'));
    if(!this.worker) {
      const dev=import.meta.url.endsWith('.ts');const url=new URL(dev?'./media-worker.ts':'./media-worker.js',import.meta.url);
      this.worker=dev?new Worker(`require('tsx/cjs'); require(${JSON.stringify(fileURLToPath(url))});`,{eval:true}):new Worker(url);
      this.worker.on('message',({id,bytes,error,template,resized}:{id:number;bytes:Uint8Array;error?:string;template?:string;resized?:boolean})=>{const p=this.pending.get(id);if(!p)return;clearTimeout(p.timer);this.pending.delete(id);if(error)p.reject(new Error(error));else p.resolve({bytes:Buffer.from(bytes),template,resized});if(!this.pending.size)this.worker?.unref();});
      this.worker.on('error',e=>this.failed(e));this.worker.on('exit',code=>{if(code)this.failed(new Error('画像処理プロセスが終了しました。再試行してください。'));this.worker=undefined;});
    }
    this.worker.ref();
    return new Promise((resolve,reject)=>{
      const id=++this.nextId;const timer=setTimeout(()=>{this.failed(new Error('画像処理が時間切れになりました。'));void this.worker?.terminate();},45_000);
      this.pending.set(id,{resolve,reject,timer});this.worker!.postMessage({id,job});
    });
  }
  private failed(e:Error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  async close(){this.failed(new Error('Botが終了しました。'));await this.worker?.terminate();this.worker=undefined;}
}
