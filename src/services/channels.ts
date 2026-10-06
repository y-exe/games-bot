import type {Store} from '../data/store.js';
const changes=new Map<string,Promise<boolean>>();
export async function toggleAllowedChannel(store:Store,channelId:string,allowed:Set<string>) {
  const previous=changes.get(channelId);
  const operation=(previous??Promise.resolve()).catch(()=>{}).then(async()=>{
    const enabled=await store.toggleChannel(channelId);
    if(enabled)allowed.add(channelId);else allowed.delete(channelId);
    return enabled;
  });
  changes.set(channelId,operation);
  try{return await operation;}finally{if(changes.get(channelId)===operation)changes.delete(channelId);}
}
