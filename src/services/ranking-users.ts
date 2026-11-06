import type {Client,Guild,User} from 'discord.js';
import type {Store} from '../data/store.js';

export interface RankingUser {displayName:string;username:string}

export async function rememberRankingUser(store:Pick<Store,'saveRankingUsers'>,user:Pick<User,'id'|'username'|'globalName'|'bot'>,now=Date.now()) {
  if(user.bot)return;
  await store.saveRankingUsers([{user_id:user.id,display_name:user.globalName??user.username,username:user.username,fetched_at:new Date(now).toISOString()}]);
}

export async function resolveRankingUsers(ids:Iterable<string>,client?:Pick<Client,'users'>,guild?:Pick<Guild,'members'>|null,store?:Pick<Store,'rankingUsers'>) {
  const profiles=new Map<string,RankingUser>();
  const unique=[...new Set(ids)];
  const stored=new Map((await store?.rankingUsers(unique)??[]).map(user=>[user.user_id,user]));
  for(const id of unique) {
    const saved=stored.get(id);
    const user=guild?.members.cache.get(id)?.user??client?.users.cache.get(id);
    if(saved||user)profiles.set(id,{displayName:guild?.members.cache.get(id)?.displayName??saved?.display_name??user!.globalName??user!.username,username:saved?.username??user!.username});
  }
  return profiles;
}
