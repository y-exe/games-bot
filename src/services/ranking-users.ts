import type {Client,Guild} from 'discord.js';
import type {Store} from '../data/store.js';
import type {RankingUserRecord} from '../data/rankings.js';

export interface RankingUser {displayName:string;username:string}

export async function resolveRankingUsers(ids:Iterable<string>,client?:Pick<Client,'users'>,guild?:Pick<Guild,'members'>|null,store?:Pick<Store,'rankingUsers'|'saveRankingUsers'>,now=Date.now(),budgetMs=120_000) {
  const profiles=new Map<string,RankingUser>();
  const unique=[...new Set(ids)];
  const stored=new Map((await store?.rankingUsers(unique)??[]).map(user=>[user.user_id,user]));
  const updates:RankingUserRecord[]=[];
  const missing:string[]=[];
  const remember=(id:string,displayName:string,username:string)=>{
    profiles.set(id,{displayName:guild?.members.cache.get(id)?.displayName??displayName,username});
  };
  const update=(id:string,user:{username:string;globalName:string|null})=>{
    const displayName=user.globalName??user.username;
    remember(id,displayName,user.username);
    updates.push({user_id:id,display_name:displayName,username:user.username,fetched_at:new Date(now).toISOString()});
  };
  for(const id of unique) {
    const saved=stored.get(id);
    if(saved) {
      remember(id,saved.display_name,saved.username);
      const age=now-Date.parse(saved.fetched_at);
      if(age>=0&&age<24*3600_000)continue;
      missing.push(id);continue;
    }
    const user=guild?.members.cache.get(id)?.user??client?.users.cache.get(id);
    if(user)update(id,user);
    else missing.push(id);
  }
  const flush=async()=>{const batch=updates.splice(0);if(batch.length)await store?.saveRankingUsers(batch);};
  await flush();
  let next=0,failed=0,stopped=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<void>(resolve=>{timer=setTimeout(()=>{stopped=true;resolve();},budgetMs);});
  const workers=client?Promise.all(Array.from({length:Math.min(4,missing.length)},async()=>{
    while(!stopped&&next<missing.length) {
      const id=missing[next++]!;
      try {const user=await client.users.fetch(id,{force:true});if(stopped)return;update(id,user);}
      catch {failed++;}
      if(updates.length>=20)await flush();
    }
  })):Promise.resolve();
  try {await Promise.race([workers,deadline]);}
  finally {stopped=true;clearTimeout(timer);}
  await flush();
  if(failed)console.warn(`ランキングのユーザー情報を${failed}件取得できませんでした。`);
  return profiles;
}
