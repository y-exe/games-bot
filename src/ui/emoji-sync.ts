import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {REST,Routes} from 'discord.js';
import sharp from 'sharp';
import {manifest,badgeAliases,setEmojiMappings} from './emojis.js';

export interface AppEmoji {id:string;name:string;animated?:boolean}
export interface EmojiAsset {name:string;image:Buffer}
export interface EmojiApi {
  applicationId():Promise<string>;
  list():Promise<AppEmoji[]>;
  create(name:string,image:Buffer):Promise<AppEmoji>;
  remove(emoji:AppEmoji):Promise<void>;
}
export function emojiApi(rest:REST,applicationId:string):EmojiApi {
  return {
    applicationId:async()=>(await rest.get(Routes.oauth2CurrentApplication()) as {id:string}).id,
    list:async()=>(await rest.get(Routes.applicationEmojis(applicationId)) as {items:AppEmoji[]}).items,
    create:async(name,image)=>await rest.post(Routes.applicationEmojis(applicationId),{body:{name,image:`data:image/png;base64,${image.toString('base64')}`}}) as AppEmoji,
    remove:async emoji=>{await rest.delete(Routes.applicationEmoji(applicationId,emoji.id));},
  };
}
export function emojiAssetName(asset:EmojiAsset) {
  return `${asset.name}_gb2_${createHash('sha256').update(asset.image).digest('hex').slice(0,8)}`;
}
export async function loadEmojiAssets(root='assets/emojis'):Promise<EmojiAsset[]> {
  return Promise.all(manifest.map(async entry=>({name:entry.name,image:await readFile(join(root,entry.outputFile??`${entry.name}.png`))})));
}
async function atomicJson(path:string,value:unknown) {
  const temp=`${path}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,path);
}

/** Reconcile with Discord rather than trusting a cache from an older container or another Bot. */
async function validateAssets(assets:EmojiAsset[]) {
  if(!assets.length||assets.length>2000)throw new Error('絵文字素材は1〜2000個で指定してください。');
  const names=new Set<string>();
  for(const asset of assets) {
    if(!/^[A-Za-z0-9_]{2,18}$/.test(asset.name)||names.has(asset.name))throw new Error('絵文字の定義名が無効または重複しています。');
    names.add(asset.name);
    const meta=await sharp(asset.image).metadata();
    if(meta.format!=='png'||meta.width!==128||meta.height!==128||asset.image.length>256*1024)throw new Error(`絵文字 ${asset.name} は128×128px・256KiB以下のPNGで用意してください。`);
  }
}
export async function syncEmojiAssets(api:EmojiApi,applicationId:string,dataDir:string,assets:EmojiAsset[]) {
  if(await api.applicationId()!==applicationId)throw new Error('絵文字の同期先とBotのアプリケーションIDが一致しません。');
  await validateAssets(assets);
  await mkdir(dataDir,{recursive:true});
  const existing=await api.list();
  const needed=assets.filter(asset=>!existing.some(emoji=>emoji.name===emojiAssetName(asset)&&!emoji.animated));
  if(existing.length+needed.length>2000)throw new Error('絵文字の空き容量が足りません。不要な登録を整理してください。');
  const mappings:Record<string,string>={};
  try {
    const saved=JSON.parse(await readFile(join(dataDir,'emojis.json'),'utf8'));
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [name,value] of Object.entries(saved))
      if(!Object.hasOwn(badgeAliases,name)&&typeof value==='string'&&existing.some(emoji=>value===`<${emoji.animated?'a':''}:${emoji.name}:${emoji.id}>`))mappings[name]=value;
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  let created=0;
  const selected:AppEmoji[]=[];
  for(const asset of assets) {
    const name=emojiAssetName(asset);
    // Deterministic names recover uploads even if the process died before persisting the mapping.
    let found=existing.filter(emoji=>emoji.name===name&&!emoji.animated).sort((a,b)=>a.id.localeCompare(b.id))[0];
    if(!found){found=await api.create(name,asset.image);existing.push(found);created++;}
    mappings[asset.name]=`<:${found.name}:${found.id}>`;selected.push(found);
  }
  // A failed upload must leave the last complete mapping untouched.
  await atomicJson(join(dataDir,'emojis.json'),mappings);
  await atomicJson(join(dataDir,'emoji-sync.json'),{applicationId,syncedAt:new Date().toISOString(),assets:selected.map(emoji=>({name:emoji.name,id:emoji.id}))});
  return {created,reused:assets.length-created,total:existing.length,mappings};
}

export async function resetEmojiAssets(api:EmojiApi,applicationId:string,dataDir:string,assets:EmojiAsset[],requestId:string) {
  if(await api.applicationId()!==applicationId)throw new Error('絵文字の整理先が一致しません。');
  await validateAssets(assets);
  if(!requestId||requestId.length>100)throw new Error('絵文字の整理IDが無効です。');
  await mkdir(dataDir,{recursive:true});
  const path=join(dataDir,'emoji-reset.json');
  let state:{id:string;applicationId:string;phase:string;targets:AppEmoji[]}|undefined;
  try{state=JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(state&&state.applicationId!==applicationId)throw new Error('整理記録のアプリケーションIDが一致しません。');
  if(state?.id!==requestId){
    if(state&&state.phase!=='done')throw new Error('進行中の絵文字整理を先に完了してください。');
    state={id:requestId,applicationId,phase:'delete',targets:await api.list()};
    await atomicJson(path,state);
  }
  if(state.phase==='delete') {
    const live=new Set((await api.list()).map(emoji=>emoji.id));
    for(const emoji of state.targets)if(live.has(emoji.id))await api.remove(emoji);
    state.phase='register';await atomicJson(path,state);
  }
  const result=await syncEmojiAssets(api,applicationId,dataDir,assets);
  state.phase='done';state.targets=[];await atomicJson(path,state);
  return result;
}

export async function syncBotEmojis(rest:REST,applicationId:string,dataDir:string) {
  const api=emojiApi(rest,applicationId),assets=await loadEmojiAssets();
  const requestPath=join(dataDir,'emoji-reset-request.json');
  let request:{id:string;applicationId:string}|undefined;
  try{request=JSON.parse(await readFile(requestPath,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(request&&request.applicationId!==applicationId)throw new Error('絵文字の整理要求のアプリケーションIDが一致しません。');
  const result=request?await resetEmojiAssets(api,applicationId,dataDir,assets,request.id):await syncEmojiAssets(api,applicationId,dataDir,assets);
  if(request)await unlink(requestPath);
  setEmojiMappings(result.mappings);
  console.log(`絵文字同期: 新規 ${result.created} / 再利用 ${result.reused}`);
  return result;
}
