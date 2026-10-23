import {Routes,type REST} from 'discord.js';
import {slashCommands} from '../commands/definitions.js';

type CommandData=Record<string,unknown>;
export interface CommandSyncApi {
  applicationId():Promise<string>;
  list(guildId?:string):Promise<CommandData[]>;
  replace(commands:CommandData[],guildId?:string):Promise<unknown>;
}
export function commandSyncApi(rest:REST,applicationId:string):CommandSyncApi {
  const route=(guildId?:string)=>guildId?Routes.applicationGuildCommands(applicationId,guildId):Routes.applicationCommands(applicationId);
  return {
    applicationId:async()=>(await rest.get(Routes.oauth2CurrentApplication()) as {id:string}).id,
    list:async guildId=>await rest.get(route(guildId)) as CommandData[],
    replace:async(commands,guildId)=>rest.put(route(guildId),{body:commands}),
  };
}
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
  return value;
}
function option(value:CommandData):CommandData {
  const normalized:CommandData={type:value.type,name:value.name,description:value.description??'',name_localizations:value.name_localizations??{},description_localizations:value.description_localizations??{},required:value.required??false,autocomplete:value.autocomplete??false,
    options:((value.options??[]) as CommandData[]).map(option),
    choices:((value.choices??[]) as CommandData[]).map(choice=>({name:choice.name,value:choice.value,name_localizations:choice.name_localizations??{}})),
    channel_types:[...((value.channel_types??[]) as number[])].sort(),
  };
  for(const key of ['min_value','max_value','min_length','max_length'])if(value[key]!=null)normalized[key]=value[key];
  return normalized;
}
function normalizedCommands(commands:CommandData[],guildId?:string) {
  return JSON.stringify(canonical(commands.map(command=>({type:command.type??1,name:command.name,description:command.description??'',name_localizations:command.name_localizations??{},description_localizations:command.description_localizations??{},
    default_member_permissions:command.default_member_permissions==null?null:String(command.default_member_permissions),nsfw:command.nsfw??false,
    ...(!guildId?{contexts:[...((command.contexts??[0,1,2]) as number[])].sort(),integration_types:[...((command.integration_types??[0]) as number[])].sort()}:{}),
    options:((command.options??[]) as CommandData[]).map(option),
  })).sort((a,b)=>a.type===b.type?String(a.name).localeCompare(String(b.name)):Number(a.type)-Number(b.type))));
}
export async function syncSlashCommands(api:CommandSyncApi,applicationId:string,guildId?:string,clearGlobal=false) {
  if(!applicationId||await api.applicationId()!==applicationId)throw new Error('コマンドの同期先とBotのアプリケーションIDが一致しません。');
  if(guildId&&!/^\d{17,20}$/.test(guildId))throw new Error('同期先サーバーIDが無効です。');
  if(clearGlobal&&!guildId)throw new Error('グローバル登録の整理にはテストサーバーの指定が必要です。');
  const desired=slashCommands.map(command=>command.toJSON()) as unknown as CommandData[];
  const existing=await api.list(guildId);
  const changed=normalizedCommands(existing,guildId)!==normalizedCommands(desired,guildId);
  if(changed)await api.replace(desired,guildId);
  let clearedGlobal=false;
  if(clearGlobal&&(await api.list()).length>0) {await api.replace([]);clearedGlobal=true;}
  return {count:desired.length,changed,clearedGlobal};
}
export async function syncStartupCommands(rest:REST,settings:{applicationId:string;production:boolean;guildId:string}) {
  if(!settings.production&&!settings.guildId)throw new Error('TEST_GUILD_ID を設定してください。ローカルではグローバル登録しません。');
  const guildId=settings.production?undefined:settings.guildId;
  const result=await syncSlashCommands(commandSyncApi(rest,settings.applicationId),settings.applicationId,guildId,!settings.production);
  console.log(`スラッシュコマンド同期: ${result.count}個 · ${result.changed?'更新':'変更なし'} · ${guildId??'グローバル'}${result.clearedGlobal?' · テストBotの旧グローバル登録を整理':''}`);
  return result;
}
