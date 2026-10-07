import {MessageFlags,Routes,type Client} from 'discord.js';
import {expiringPrefixes} from '../commands/policy.js';
import {disableRawButtons} from './cards.js';

interface Entry { channelId:string;messageId:string;expires:number }
const entries=new Map<string,Entry>();
const disabledAt=new Map<string,number>();
let timer:NodeJS.Timeout|undefined;
export const buttonExpiryMs=()=>10*60_000;

const isExpiring=(customId:string)=>expiringPrefixes.some(prefix=>customId.startsWith(prefix));
function walkHasExpiring(components:readonly unknown[]):boolean {
  return components.some(component=>{
    const data=component as {type:number;components?:unknown[];custom_id?:string};
    if(Array.isArray(data.components))return walkHasExpiring(data.components);
    return (data.type===2||data.type===3)&&typeof data.custom_id==='string'&&isExpiring(data.custom_id);
  });
}
export function trackExpiringButtons(message:{id:string;channelId:string;components:readonly unknown[]}) {
  if(!walkHasExpiring(message.components))return;
  entries.set(message.id,{channelId:message.channelId,messageId:message.id,expires:Date.now()+buttonExpiryMs()});
}
export function getDisabledMinutes(messageId:string,now=Date.now()):number|undefined {
  const at=disabledAt.get(messageId);
  return at?Math.max(1,Math.floor((now-at)/60_000)):undefined;
}
async function disableNow(client:Client,e:Entry) {
  const message=await client.channels.fetch(e.channelId).then(channel=>channel?.isTextBased()&&'messages' in channel?channel.messages.fetch(e.messageId).catch(()=>undefined):undefined);
  if(!message||!message.components.length)return;
  disabledAt.set(e.messageId,Date.now());
  for(const [id,at] of [...disabledAt])if(Date.now()-at>24*3600_000)disabledAt.delete(id);
  await client.rest.patch(Routes.channelMessage(e.channelId,e.messageId),{body:{components:disableRawButtons(message.components,isExpiring),flags:MessageFlags.IsComponentsV2}});
}
export function startButtonExpirySweep(client:Client) {
  timer??=setInterval(()=> {
    const now=Date.now();
    for(const [id,e] of [...entries])if(e.expires<=now){entries.delete(id);void disableNow(client,e).catch(()=>{});}
  },15_000);
  timer.unref();
}