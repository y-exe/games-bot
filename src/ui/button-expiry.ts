import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {MessageFlags,Routes,type Client,type ButtonInteraction,type InteractionEditReplyOptions} from 'discord.js';
import {buttonLifetimeMs,privateButtonLifetimeMs,expiringPrefixes} from '../commands/policy.js';
import {settings} from '../config.js';
import {disableRawButtons} from './cards.js';

type Edit=(components:ReturnType<typeof disableRawButtons>)=>Promise<unknown>;
interface Entry {channelId:string;messageId:string;expires:number;private?:boolean;components?:readonly unknown[];edit?:Edit;retryAt?:number}
interface ExpiringMessage {id:string;channelId:string;components:readonly unknown[];createdTimestamp?:number;editedTimestamp?:number|null;flags?:{has(flag:number):boolean}}
export const buttonExpiryMs=(privateMessage=false)=>privateMessage?privateButtonLifetimeMs:buttonLifetimeMs;
const isExpiring=(id:string)=>expiringPrefixes.some(prefix=>id.startsWith(prefix));
function activeControls(components:readonly unknown[]):boolean {
  return components.some(component=>{
    const value=component as {toJSON?:()=>unknown};
    const data=(typeof value.toJSON==='function'?value.toJSON():component) as {type:number;components?:unknown[];custom_id?:string;disabled?:boolean};
    if(Array.isArray(data.components))return activeControls(data.components);
    return [2,3,5,6,7,8].includes(data.type)&&!data.disabled&&typeof data.custom_id==='string'&&isExpiring(data.custom_id);
  });
}
function repairInvalidEmojis(components:ReturnType<typeof disableRawButtons>,error:unknown) {
  const failure=error as {code?:number;rawError?:{errors?:unknown}};
  if(failure.code!==50035||!failure.rawError?.errors)return;
  const repaired=structuredClone(components);let changed=false;
  const invalid=(value:unknown):boolean=>Boolean(value&&typeof value==='object'&&((value as {code?:string}).code==='COMPONENT_INVALID_EMOJI'||Object.values(value).some(invalid)));
  const visit=(errors:unknown,target:unknown)=>{
    if(!errors||typeof errors!=='object'||!target||typeof target!=='object')return;
    const data=target as Record<string,unknown>;
    for(const [key,value]of Object.entries(errors)) {
      if(key==='emoji'&&invalid(value)&&Object.hasOwn(data,key)) {delete data[key];changed=true;}
      else if(key!=='_errors')visit(value,data[key]);
    }
  };
  visit(failure.rawError.errors,{components:repaired});
  return changed?repaired:undefined;
}
export class ButtonExpiryRegistry {
  private entries=new Map<string,Entry>();
  private disabledAt=new Map<string,number>();
  private saving:Promise<void>=Promise.resolve();
  private restoring?:Promise<void>;
  private sweeping?:Promise<void>;
  constructor(private dataDir?:string,private now:()=>number=Date.now) {}
  deadline(id:string) {return this.entries.get(id)?.expires??this.disabledAt.get(id);}
  disabled(id:string) {return this.disabledAt.get(id);}
  track(message:ExpiringMessage,edit?:Edit) {
    if(!activeControls(message.components)) {
      if(this.entries.delete(message.id))void this.save().catch(()=>console.error('ボタンの期限記録を保存できませんでした。'));
      return;
    }
    const privateMessage=message.flags?.has(MessageFlags.Ephemeral)??false;
    if(privateMessage&&!edit)return;
    const existing=this.entries.get(message.id);
    const shownAt=message.editedTimestamp??message.createdTimestamp??this.now();
    this.entries.set(message.id,{channelId:message.channelId,messageId:message.id,
      expires:existing?.expires??shownAt+buttonExpiryMs(privateMessage),
      components:message.components,
      ...(privateMessage?{private:true,components:message.components,edit}:{}),
    });
    if(!privateMessage)void this.save().catch(()=>console.error('ボタンの期限記録を保存できませんでした。'));
  }
  private save() {
    if(!this.dataDir)return Promise.resolve();
    const pending=this.saving.catch(()=>{}).then(async()=>{
      await this.restore();
      for(const [id,at]of this.disabledAt)if(this.now()-at>24*3600_000)this.disabledAt.delete(id);
      const data={version:1,applicationId:settings.applicationId,
        entries:[...this.entries.values()].filter(e=>!e.private).map(({channelId,messageId,expires})=>({channelId,messageId,expires})),disabledAt:[...this.disabledAt],
      };
      await mkdir(this.dataDir!,{recursive:true});
      const target=join(this.dataDir!,'button-expiry.json'),temp=`${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp,JSON.stringify(data));
        for(let attempt=0;;attempt++) {
          try {await rename(temp,target);break;}
          catch(error) {
            if(attempt>=5||!['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code??''))throw error;
            await delay(20*(attempt+1));
          }
        }
      } catch(error) {await unlink(temp).catch(()=>{});throw error;}
    });
    this.saving=pending;
    return pending;
  }
  restore() {this.restoring??=this.load();return this.restoring;}
  private async load() {
    if(!this.dataDir)return;
    try {
      const data=JSON.parse(await readFile(join(this.dataDir,'button-expiry.json'),'utf8'));
      if(data.version!==1||data.applicationId!==settings.applicationId)return;
      for(const e of data.entries??[])if(typeof e.channelId==='string'&&typeof e.messageId==='string'&&Number.isFinite(e.expires)&&!this.entries.has(e.messageId))
        this.entries.set(e.messageId,{channelId:e.channelId,messageId:e.messageId,expires:e.expires});
      for(const [id,at]of data.disabledAt??[])if(typeof id==='string'&&Number.isFinite(at)&&this.now()-at<24*3600_000&&!this.disabledAt.has(id))this.disabledAt.set(id,at);
    } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')console.error('ボタンの期限記録を読み込めませんでした。');}
  }
  private async disable(client:Client,e:Entry) {
    let components=e.components;
    if(!e.private&&!components) {
        const channel=await client.channels.fetch(e.channelId);
        if(!channel?.isTextBased()||!('messages' in channel))throw new Error('ボタンのチャンネルにアクセスできません。');
        components=(await channel.messages.fetch(e.messageId)).components;
    }
    if(activeControls(components??[])) {
      const disabled=disableRawButtons(components??[],isExpiring);
      const edit=e.private?e.edit!:(value:typeof disabled)=>client.rest.patch(Routes.channelMessage(e.channelId,e.messageId),{body:{components:value,flags:MessageFlags.IsComponentsV2}});
      try {await edit(disabled);}
      catch(error) {
        const repaired=repairInvalidEmojis(disabled,error);
        if(!repaired)throw error;
        await edit(repaired);
      }
    }
    this.disabledAt.set(e.messageId,this.now());
  }
  async sweep(client:Client) {
    if(this.sweeping)return;
    const pending=(async()=>{
      const due=[...this.entries.values()].filter(e=>e.expires<=this.now()&&(!e.retryAt||e.retryAt<=this.now()));
      for(const e of due) {
        try {
          await this.disable(client,e);
          if(this.entries.get(e.messageId)===e)this.entries.delete(e.messageId);
        } catch(error) {
          const code=(error as {code?:number}).code;
          if(code===10008||code===10003)this.entries.delete(e.messageId);
          else {e.retryAt=this.now()+5_000;console.error(`ボタンの無効化を再試行します（${code??'通信エラー'}）。`);}
        }
      }
      if(due.length)await this.save();
    })();
    this.sweeping=pending;
    try {await pending;}finally{this.sweeping=undefined;}
  }
  async recoverRecent(client:Client,channels:ReadonlySet<string>) {
    for(const id of channels) {
      try {
        const channel=await client.channels.fetch(id);
        if(!channel?.isTextBased()||!('messages' in channel))continue;
        const messages=await channel.messages.fetch({limit:100});
        for(const message of messages.values())if(message.author?.id===client.user?.id&&!this.disabledAt.has(message.id))this.track(message);
      } catch {console.error('過去のカードの期限を確認できませんでした。');}
    }
  }
  async close(client?:Client) {
    if(this.sweeping)await this.sweeping;
    if(client)for(const e of [...this.entries.values()].filter(e=>e.private)) {
      try {await this.disable(client,e);}catch {}
      this.entries.delete(e.messageId);
    }
    await this.save();await this.saving;
  }
}
const registry=new ButtonExpiryRegistry(settings.dataDir);
let timer:NodeJS.Timeout|undefined;
export const trackExpiringButtons=(message:ExpiringMessage)=>registry.track(message);
export function trackInteractionButtons(i:Pick<ButtonInteraction,'webhook'>,message:ExpiringMessage) {
  registry.track(message,components=>i.webhook.editMessage(message.id,{components:components as InteractionEditReplyOptions['components'],flags:MessageFlags.IsComponentsV2}));
}
export const getDisabledAt=(id:string)=>registry.disabled(id);
export const getButtonDeadline=(id:string)=>registry.deadline(id);
export async function startButtonExpirySweep(client:Client,channels:ReadonlySet<string>=new Set()) {
  await registry.restore();await registry.recoverRecent(client,channels);
  void registry.sweep(client).catch(()=>console.error('ボタンの期限処理に失敗しました。'));
  timer??=setInterval(()=>void registry.sweep(client).catch(()=>console.error('ボタンの期限処理に失敗しました。')),1_000);
  timer.unref();
}
export async function stopButtonExpirySweep(client:Client) {
  if(timer)clearInterval(timer);timer=undefined;
  await registry.close(client);
}
