import {AttachmentBuilder} from 'discord.js';
import {rankingLimit,type RankingEntry} from '../data/rankings.js';
import {formatAmount} from '../data/money.js';
import {card} from './cards.js';

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
export function rankingExportResponse(rich:RankingEntry[],poor:RankingEntry[],resolveName:(id:string)=>string|undefined=()=>undefined,now=new Date()) {
  rich=rich.slice(0,rankingLimit);poor=poor.slice(0,rankingLimit);
  const timestamp=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(now);
  const list=(entries:RankingEntry[])=>entries.map((entry,index)=>{
    const name=resolveName(entry.user_id)?.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
    return `${index+1}位  ${name?`${name} (ID: ${entry.user_id})`:`ID: ${entry.user_id}`}  ${formatAmount(entry.points)}pt`;
  }).join('\n')||'該当するプレイヤーがいません。';
  const text=`ポイントランキング\n取得日時: ${timestamp} JST\n各ランキング上位最大${rankingLimit}件\n\n【富豪ランキング・${rich.length}件】\n${list(rich)}\n\n【貧乏ランキング・${poor.length}件】\n${list(poor)}\n\n名前が分かるユーザーは表示名を併記しています。名前がない場合もIDで確認できます。\n`;
  const parts=previewParts(text);
  const files=parts.map((part,index)=>new AttachmentBuilder(Buffer.from(part,'utf8'),{name:parts.length===1?'point-rankings.txt':`point-rankings-${String(index+1).padStart(2,'0')}.txt`}));
  const messages=[];
  for(let start=0;start<files.length;start+=10)messages.push({
    files:files.slice(start,start+10),allowedMentions:{parse:[] as ('users'|'roles'|'everyone')[],repliedUser:false},
  });
  const summary=card('ゲームポイント · ランキング一覧',`**富豪 ${formatAmount(rich.length)}件** · **貧乏 ${formatAmount(poor.length)}件**\n下の添付ファイルを、Discord内のプレビューで読めます。\n-# 各上位最大1,000件 · 取得時点の順位・残高です。${parts.length>1?`\n-# 長い一覧は${parts.length}ファイルに分けています。`:''}`,'info',[],undefined,undefined,undefined,0xf1c40f);
  return {summary,attachments:messages};
}
