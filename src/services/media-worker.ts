import {UserError} from '../errors.js';
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import {generateWatermark,mediaFileLimit} from './watermark.js';
import {generateGamingGif} from './gaming.js';
import {generateTextImage} from './text-image.js';

sharp.cache({memory:32,items:32,files:0});sharp.concurrency(1);
export interface MediaJob { kind:string; text?:string; square?:boolean; bytes?:Uint8Array }
parentPort?.on('message',async({id,job}:{id:number;job:MediaJob})=>{
  try{
    const watermark=job.kind==='watermark'?await generateWatermark(Buffer.from(job.bytes!)):undefined;
    const bytes=watermark?.bytes??(job.kind.startsWith('text')?await generateTextImage(job.kind,job.text??'',Boolean(job.square)||['text4','text5'].includes(job.kind)):await generateGamingGif(Buffer.from(job.bytes!)));
    if(bytes.length>mediaFileLimit)throw new UserError('生成画像が大きすぎます。より小さい画像で再試行してください。');
    parentPort!.postMessage({id,bytes,template:watermark?.template,resized:watermark?.resized});
  }catch(e){parentPort!.postMessage({id,error:e instanceof Error?e.message:'画像の加工に失敗しました。'});}
});
