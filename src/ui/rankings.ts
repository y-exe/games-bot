import {AttachmentBuilder} from 'discord.js';
import {rankingLimit,type RankingEntry} from '../data/rankings.js';
import {formatAmount} from '../data/money.js';
import {card} from './cards.js';
import type {RankingUser} from '../services/ranking-users.js';
import {noMentions} from './mentions.js';

const previewBytes=48*1024;
function previewParts(text:string) {
  const parts:string[]=[];
  let part='',bytes=0;
  for(const line of text.split(/(?<=\n)/)) {
    const length=Buffer.byteLength(line,'utf8');
    if(length<=previewBytes) {
      if(bytes+length>previewBytes) {parts.push(part);part='';bytes=0;}
      part+=line;bytes+=length;
    } else for(const character of line) {
      const size=Buffer.byteLength(character,'utf8');
      if(bytes+size>previewBytes) {parts.push(part);part='';bytes=0;}
      part+=character;bytes+=size;
    }
  }
  if(part)parts.push(part);
  return parts;
}
export function rankingExportResponse(ranks:RankingEntry[],resolveUser:(id:string)=>RankingUser|undefined=()=>undefined,now=new Date()) {
  ranks=ranks.slice(0,rankingLimit);
  const unnamed=ranks.filter(entry=>!resolveUser(entry.user_id)).length;
  const timestamp=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(now);
  const list=(entries:RankingEntry[])=>entries.map((entry,index)=>{
    const user=resolveUser(entry.user_id);
    const clean=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
    const name=user&&clean(user.displayName),username=user&&clean(user.username);
    return `${index+1}位  ${name&&username?`${name} (@${username})`:`ID: ${entry.user_id}`}  ${formatAmount(entry.points)}pt`;
  }).join('\n')||'該当するプレイヤーがいません。';
  const text=`ポイントランキング\n取得日時: ${timestamp} JST\nポイントの多い順・上位最大${rankingLimit}人\n\n${list(ranks)}\n\n表示名 (@ユーザー名) で表示しています。情報を取得できなかったユーザーはIDで表示します。\n`;
  const parts=previewParts(text);
  const files=parts.map((part,index)=>new AttachmentBuilder(Buffer.from(part,'utf8'),{name:parts.length===1?'point-rankings.txt':`point-rankings-${String(index+1).padStart(2,'0')}.txt`}));
  const messages=[];
  for(let start=0;start<files.length;start+=10)messages.push({
    files:files.slice(start,start+10),allowedMentions:noMentions,
  });
  const summary=card('ゲームポイント · ランキング一覧',`**上位 ${formatAmount(ranks.length)}人**\n下の添付ファイルを、Discord内のプレビューで読めます。${unnamed?`\n-# 名前を取得できなかった${unnamed}人はID表示です。取得済みの名前は保存され、一覧を開き直すと続きから取得します。`:''}\n-# ポイントの多い順に最大1,000人 · 取得時点の順位・残高です。${parts.length>1?`\n-# 長い一覧は${parts.length}ファイルに分けています。`:''}`,'info',[],undefined,undefined,undefined,0xf1c40f);
  return {summary,attachments:messages};
}
