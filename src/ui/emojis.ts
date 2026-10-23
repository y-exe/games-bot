import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import { settings } from '../config.js';

export interface EmojiEntry {name:string;sourceId?:string;animated:boolean;sourceFile?:string;outputFile?:string}
export interface BadgeEntry extends EmojiEntry {title:string;category:string;tier?:number;sourceFile:string;sourceUrl:string;sourceKind:'discord-official'|'archive';sha256:string;aliases?:string[]}
export const badgeManifest:BadgeEntry[]=JSON.parse(readFileSync('assets/badge-manifest.json','utf8'));
export const badgeAliases:Record<string,string>=Object.fromEntries(badgeManifest.flatMap(badge=>(badge.aliases??[]).map(alias=>[alias,badge.name])));
export const manifest:EmojiEntry[]=[...JSON.parse(readFileSync('assets/emoji-manifest.json','utf8').replace(/^\uFEFF/,'')),...badgeManifest];
let registered: Record<string, string> = {};
let saving:Promise<void>=Promise.resolve();
export function setEmojiMappings(entries:Record<string,string>) {registered={...entries};}
export function loadEmojis() {
  try { registered = JSON.parse(readFileSync(join(settings.dataDir, 'emojis.json'), 'utf8')); }
  catch { registered = {}; }
}
export function emoji(name: string) {
  name=badgeAliases[name]??name;
  if (registered[name]) return registered[name]!;
  const source=manifest.find(e=>e.name===name);
  return source?.sourceId?`<${source.animated?'a':''}:${name}:${source.sourceId}>`:'';
}
export async function registerEmojis(entries:Record<string,string>) {
  const pending=saving.catch(()=>{}).then(async()=>{
    const merged={...registered,...entries};
    await mkdir(settings.dataDir,{recursive:true});
    const path=join(settings.dataDir,'emojis.json'),temp=`${path}.${randomUUID()}.tmp`;
    await writeFile(temp,JSON.stringify(merged,null,2));await rename(temp,path);
    registered=merged;
  });
  saving=pending;await pending;
}
export const handEmojis = { rock: '✊', scissors: '✌️', paper: '✋' };
