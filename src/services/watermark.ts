import {UserError} from '../errors.js';
import sharp from 'sharp';
import {access} from 'node:fs/promises';
import {join} from 'node:path';
import {randomInt} from 'node:crypto';
import {watermarkTemplates} from './watermark-templates.js';

export const mediaFileLimit=Math.floor(7.8*1024*1024);
export interface WatermarkResult {bytes:Buffer;template:string;resized:boolean}
export function watermarkCandidates(ratio:number,names:Set<string>) {
  return watermarkTemplates.filter(t=>names.has(t.name)).sort((a,b)=>Math.abs(a.ratio-ratio)-Math.abs(b.ratio-ratio)).slice(0,4);
}
export async function generateWatermark(bytes:Buffer,templateName?:string):Promise<WatermarkResult> {
  const metadata=await sharp(bytes,{limitInputPixels:30_000_000}).metadata();
  if(!metadata.width||!metadata.height)throw new UserError('画像のサイズを取得できません。');
  const available=new Set<string>();
  for(const t of watermarkTemplates)try{await access(join('assets/watermark_templates',t.name));available.add(t.name);}catch{}
  const candidates=watermarkCandidates(metadata.autoOrient.width/metadata.autoOrient.height,available);
  const selected=templateName?watermarkTemplates.find(t=>t.name===templateName&&available.has(t.name)):candidates[randomInt(Math.max(1,candidates.length))];
  if(!selected)throw new UserError('加工テンプレートが見つかりません。');
  const overlay=await sharp(join('assets/watermark_templates',selected.name),{limitInputPixels:60_000_000}).resize(selected.width,selected.height,{fit:'fill'}).png().toBuffer();
  const base=await sharp(bytes,{limitInputPixels:30_000_000}).autoOrient().resize(selected.width,selected.height,{fit:'cover'}).ensureAlpha().png().toBuffer();
  let output=await sharp(base,{limitInputPixels:60_000_000}).composite([{input:overlay}]).png().toBuffer();
  let resized=false;
  for(let iteration=0;output.length>mediaFileLimit&&iteration<7;iteration++) {
    const m=await sharp(output,{limitInputPixels:60_000_000}).metadata();
    if(Math.min(m.width!,m.height!)<=300)break;
    const factor=iteration===0?Math.max(.1,Math.min(Math.sqrt(mediaFileLimit/output.length)*.9,.95)):.85;
    output=await sharp(output,{limitInputPixels:60_000_000}).resize(Math.floor(m.width!*factor),Math.floor(m.height!*factor),{fit:'inside'}).png({compressionLevel:7}).toBuffer();resized=true;
  }
  if(output.length>mediaFileLimit)throw new UserError('生成画像が大きすぎます。より小さい画像で再試行してください。');
  return {bytes:output,template:selected.name,resized};
}
