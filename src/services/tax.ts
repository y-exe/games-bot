import { Store,jstDate } from '../data/store.js';
import {errorReport} from '../errors.js';
export function taxScheduler(store:Store,botId:()=>string) {
  let busy=false;let lastDate='';
  const check=async()=>{
    const now=new Date();const date=jstDate(now);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}).format(now));
    if(hour<5||busy||lastDate===date)return;busy=true;
    try{await store.wealthTax(botId(),now);lastDate=date;}catch(e){errorReport(e,'定期調整');}finally{busy=false;}
  };
  void check();const timer=setInterval(()=>void check(),60_000);timer.unref();return ()=>clearInterval(timer);
}
