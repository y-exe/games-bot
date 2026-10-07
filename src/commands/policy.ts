import {UserError} from '../errors.js';
const seconds:Record<string,number>={point:0,gamble:5,bet:3,login:3,give:10,othello:0,connectfour:10,highlow:10,janken:10,leave:0,text:10,text2:10,text3:10,text4:10,text5:10,watermark:15,gaming:15,voice:20,'5000':5,sync:0,help:5,setchannel:5,imakita:0,rate:5,tenki:10,totusi:3,info:5,time:3,ping:5};
export function cooldownMs(name:string){return (seconds[name]??2)*1000;}
export function channelAllowsCommand(name:string,channelId:string,allowed:ReadonlySet<string>){return ['setchannel','imakita'].includes(name)||allowed.has(channelId);}
export function channelAllowsComponent(customId:string,channelId:string,allowed:ReadonlySet<string>) {
  if(allowed.has(channelId))return true;
  return !['replay:','summary:','eco:login:','again:'].some(prefix=>customId.startsWith(prefix));
}
export const expiringPrefixes=['help:','time:','tenki:','rate:','summary:','eco:future','eco:point','eco:poor','eco:rankings','eco:details','eco:mechanism','prompt:'];
export function expiredInteraction(customId:string,ageMs:number,minutes=10) {
  return expiringPrefixes.some(prefix=>customId.startsWith(prefix))&&ageMs>minutes*60_000;
}
export class CommandCooldowns {
  private expires=new Map<string,number>();
  take(userId:string,name:string,now=Date.now()) {
    const duration=cooldownMs(name);if(!duration)return;
    const key=`${userId}:${name}`,expires=this.expires.get(key)??0;
    if(expires>now)throw new UserError(`あと <t:${Math.floor(expires/1000)}:R> 待って再試行してください。`);
    for(const [k,v]of this.expires)if(v<=now)this.expires.delete(k);
    this.expires.set(key,now+duration);
  }
}
