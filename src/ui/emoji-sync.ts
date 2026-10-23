import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {REST,Routes} from 'discord.js';
import sharp from 'sharp';
import {badgeAliases,setEmojiMappings} from './emojis.js';
import {loadAllEmojiAssets} from './emoji-assets.js';
export {loadEmojiAssets,loadAllEmojiAssets} from './emoji-assets.js';

export interface AppEmoji {id:string;name:string;animated?:boolean}
export interface EmojiAsset {name:string;image:Buffer}
export interface EmojiApi {
  applicationId():Promise<string>;
  list():Promise<AppEmoji[]>;
  create(name:string,image:Buffer):Promise<AppEmoji>;
  rename(emoji:AppEmoji,name:string):Promise<AppEmoji>;
  download(emoji:AppEmoji):Promise<Buffer>;
  remove(emoji:AppEmoji):Promise<void>;
}
export function emojiApi(rest:REST,applicationId:string):EmojiApi {
  return {
    applicationId:async()=>(await rest.get(Routes.oauth2CurrentApplication()) as {id:string}).id,
    list:async()=>(await rest.get(Routes.applicationEmojis(applicationId)) as {items:AppEmoji[]}).items,
    create:async(name,image)=>await rest.post(Routes.applicationEmojis(applicationId),{body:{name,image:`data:image/png;base64,${image.toString('base64')}`}}) as AppEmoji,
    rename:async(emoji,name)=>await rest.patch(Routes.applicationEmoji(applicationId,emoji.id),{body:{name}}) as AppEmoji,
    download:async emoji=>{
      const response=await fetch(`https://cdn.discordapp.com/emojis/${emoji.id}.png?size=128&quality=lossless`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`絵文字の照合に失敗しました（HTTP ${response.status}）。`);
      return Buffer.from(await response.arrayBuffer());
    },
    remove:async emoji=>{await rest.delete(Routes.applicationEmoji(applicationId,emoji.id));},
  };
}
export function emojiAssetName(asset:EmojiAsset) {
  return asset.name;
}
export async function renameLegacyChessEmojis(api:EmojiApi) {
  const entries=await api.list();
  let renamed=0;
  for(const entry of entries.filter(e=>/^chess4_(empty|[wb][prnbqk])_[01](?:_[smtc])?$/.test(e.name))) {
    const name=entry.name.replace(/^chess4_/,'c_');
    if(entries.some(e=>e.name===name))throw new Error(`チェス絵文字 ${name} が重複しています。`);
    Object.assign(entry,await api.rename(entry,name));renamed++;
  }
  return renamed;
}
async function atomicJson(path:string,value:unknown) {
  const temp=`${path}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify(value,null,2)+'\n');
  try {
    for(let attempt=0;;attempt++) {
      try{await rename(temp,path);return;}
      catch(error){
        if(process.platform!=='win32'||attempt>=5||!['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code??''))throw error;
        await delay(20*(attempt+1));
      }
    }
  }catch(error){await unlink(temp).catch(()=>{});throw error;}
}

async function validateAssets(assets:EmojiAsset[]) {
  if(!assets.length||assets.length>2000)throw new Error('絵文字素材は1〜2000個で指定してください。');
  const names=new Set<string>();
  for(const asset of assets) {
    if(!/^[A-Za-z0-9_]{2,32}$/.test(asset.name)||names.has(asset.name))throw new Error('絵文字の定義名が無効または重複しています。');
    names.add(asset.name);
    const meta=await sharp(asset.image).metadata();
    if(meta.format!=='png'||meta.width!==128||meta.height!==128||asset.image.length>256*1024)throw new Error(`絵文字 ${asset.name} は128×128px・256KiB以下のPNGで用意してください。`);
  }
}
export async function syncEmojiAssets(api:EmojiApi,applicationId:string,dataDir:string,assets:EmojiAsset[]) {
  if(await api.applicationId()!==applicationId)throw new Error('絵文字の同期先とBotのアプリケーションIDが一致しません。');
  await validateAssets(assets);
  if(assets.some(asset=>asset.name.startsWith('c_')))await renameLegacyChessEmojis(api);
  await mkdir(dataDir,{recursive:true});
  const existing=await api.list();
  for(const asset of assets) {
    const label=/^b_([A-Z0-9])$/.exec(asset.name)?.[1];
    if(!label)continue;
    const previous=existing.find(e=>e.name===(/^\d$/.test(label)?`${label}_o`:`o_${label}`));
    if(!previous)continue;
    if(existing.some(e=>e.name===asset.name))throw new Error(`青い文字絵文字 ${asset.name} が重複しています。`);
    Object.assign(previous,await api.rename(previous,asset.name));
  }
  const statePath=join(dataDir,'emoji-sync.json');
  type RecordEntry={name:string;id:string;sha256?:string};
  const records=new Map<string,RecordEntry>();
  try {
    const saved=JSON.parse(await readFile(statePath,'utf8'));
    if(saved.applicationId===applicationId&&Array.isArray(saved.assets))for(const entry of saved.assets)
      if(typeof entry.id==='string'&&typeof entry.name==='string'&&existing.some(emoji=>emoji.id===entry.id))records.set(entry.id,entry);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  const mappings:Record<string,string>={};
  try {
    const saved=JSON.parse(await readFile(join(dataDir,'emojis.json'),'utf8'));
    if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const [name,value] of Object.entries(saved)){
      const id=typeof value==='string'?/^<a?:[^:>]+:(\d+)>$/.exec(value)?.[1]:undefined;
      const found=existing.find(emoji=>emoji.id===id);
      if(!Object.hasOwn(badgeAliases,name)&&found){
        const label=/^o_([A-Z])$/.exec(name)?.[1]??/^([0-9])_o$/.exec(name)?.[1];
        const renamedChess=name.startsWith('chess4_')&&found.name===name.replace(/^chess4_/,'c_');
        const key=renamedChess||label&&found.name===`b_${label}`?found.name:name;
        mappings[key]=`<${found.animated?'a':''}:${found.name}:${found.id}>`;
      }
    }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  let created=0;
  const saveState=()=>atomicJson(statePath,{applicationId,syncedAt:new Date().toISOString(),assets:[...records.values()]});
  for(const asset of assets) {
    const name=emojiAssetName(asset),sha256=createHash('sha256').update(asset.image).digest('hex');
    const legacyName=`${name}_gb2_${sha256.slice(0,8)}`;
    const temporaryName=`${name.slice(0,15)}_tmp_${createHash('sha256').update(name).update(asset.image).digest('hex').slice(0,12)}`;
    let found:AppEmoji|undefined;
    for(const candidate of existing.filter(emoji=>!emoji.animated&&[name,legacyName,temporaryName].includes(emoji.name)).sort((a,b)=>a.id.localeCompare(b.id))) {
      const record=records.get(candidate.id);
      if(record?.sha256===sha256||candidate.name===legacyName||candidate.name===temporaryName){found=candidate;break;}
      if(record?.sha256)continue;
      const decode=(image:Buffer)=>sharp(image).resize(128,128).ensureAlpha().raw().toBuffer();
      if((await decode(await api.download(candidate))).equals(await decode(asset.image))){found=candidate;break;}
    }
    if(!found){
      if(existing.length>=2000)throw new Error('絵文字の空き容量が足りません。不要な登録を整理してください。');
      found=await api.create(existing.some(emoji=>emoji.name===name)?temporaryName:name,asset.image);existing.push(found);created++;
    }
    if(found.name!==name){
      records.set(found.id,{name,id:found.id,sha256});await saveState();
      for(const previous of existing.filter(emoji=>emoji.name===name&&emoji.id!==found.id)){
        await api.remove(previous);records.delete(previous.id);existing.splice(existing.indexOf(previous),1);
      }
      const updated=await api.rename(found,name);Object.assign(found,updated);
    }
    const previousRecord=records.get(found.id);
    records.set(found.id,{name,id:found.id,sha256});
    if(previousRecord?.name!==name||previousRecord.sha256!==sha256)await saveState();
    mappings[asset.name]=`<:${found.name}:${found.id}>`;
  }
  await saveState();
  await atomicJson(join(dataDir,'emojis.json'),mappings);
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
  const api=emojiApi(rest,applicationId),assets=await loadAllEmojiAssets();
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
