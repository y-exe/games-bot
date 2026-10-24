import type {Store} from '../data/store.js';
import {nextLoginTime} from '../data/login.js';
import {errorReport} from '../errors.js';
interface Timing {now?:()=>Date;schedule?:typeof setTimeout;cancel?:typeof clearTimeout}
export function taxScheduler(store:Pick<Store,'wealthTax'>,botId:()=>string,timing:Timing={}) {
  const now=timing.now??(()=>new Date()),schedule=timing.schedule??setTimeout,cancel=timing.cancel??clearTimeout;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  const check=async()=>{
    const at=now();let retry=false;
    try{await store.wealthTax(botId(),at);}catch(e){errorReport(e,'定期調整');retry=true;}
    if(stopped)return;
    const wait=retry?60_000:Math.max(0,nextLoginTime(at).getTime()-now().getTime());
    timer=schedule(()=>void check(),wait);timer.unref();
  };
  void check();return ()=>{stopped=true;if(timer)cancel(timer);};
}
