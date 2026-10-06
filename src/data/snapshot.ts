import {UserError} from '../errors.js';
import {createHash} from 'node:crypto';

export interface EconomySnapshot {
  version:1;
  capturedAt:string;
  accounts:{userId:string;points:string;lastLogin:string|null;consecutiveDays:string;gambleDate:string|null;gambleCount:string}[];
  allowedChannels:string[];
  weatherCities:{name:string;id:string}[];
}
type Query=(sql:string)=>Promise<Record<string,unknown>[]>;
function integer(value:unknown):string {
  const text=String(value);
  if(!/^[+-]?\d+(?:\.0+)?$/.test(text))throw new UserError('スナップショットに整数以外の値があります。');
  return BigInt(text.replace(/\.0+$/,'')).toString();
}
function calendar(value:unknown):string|null {
  if(value===null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new UserError('スナップショットの日付形式が無効です。');
  return value;
}
function text(value:unknown):string {
  if(typeof value!=='string')throw new UserError('スナップショットの文字列形式が無効です。');
  return value;
}
export async function readEconomySnapshot(query:Query):Promise<EconomySnapshot> {
  const accounts=await query('SELECT CAST(user_id AS text) AS user_id,CAST(points AS text) AS points,CAST(last_login AS text) AS last_login,CAST(consecutive_days AS text) AS consecutive_days,CAST(gamble_date AS text) AS gamble_date,CAST(gamble_count AS text) AS gamble_count FROM games_bot_economy');
  const channels=await query('SELECT CAST(channel_id AS text) AS channel_id FROM games_bot_allowed_channels');
  const cities=await query('SELECT city_name,city_id FROM games_bot_weather_cities');
  return {
    version:1,capturedAt:new Date().toISOString(),
    accounts:accounts.map(r=>({userId:integer(r.user_id),points:integer(r.points),lastLogin:calendar(r.last_login),consecutiveDays:integer(r.consecutive_days),gambleDate:calendar(r.gamble_date),gambleCount:integer(r.gamble_count)})),
    allowedChannels:channels.map(r=>integer(r.channel_id)),weatherCities:cities.map(r=>({name:text(r.city_name),id:text(r.city_id)})),
  };
}
export function parseSnapshot(json:string):EconomySnapshot {
  const raw=JSON.parse(json) as EconomySnapshot;
  if(raw?.version!==1||typeof raw.capturedAt!=='string'||!Array.isArray(raw.accounts)||!Array.isArray(raw.allowedChannels)||!Array.isArray(raw.weatherCities))throw new UserError('対応していないスナップショット形式です。');
  const result:EconomySnapshot={version:1,capturedAt:raw.capturedAt,
    accounts:raw.accounts.map(a=>({userId:integer(text(a.userId)),points:integer(text(a.points)),lastLogin:calendar(a.lastLogin),consecutiveDays:integer(text(a.consecutiveDays)),gambleDate:calendar(a.gambleDate),gambleCount:integer(text(a.gambleCount))})),
    allowedChannels:raw.allowedChannels.map(id=>integer(text(id))),weatherCities:raw.weatherCities.map(c=>({name:text(c.name),id:text(c.id)})),
  };
  for(const keys of [result.accounts.map(a=>a.userId),result.allowedChannels,result.weatherCities.map(c=>c.name)])if(new Set(keys).size!==keys.length)throw new UserError('スナップショットに重複したキーがあります。');
  return result;
}
function canonical(snapshot:EconomySnapshot) {
  return {version:snapshot.version,
    accounts:[...snapshot.accounts].sort((a,b)=>a.userId<b.userId?-1:a.userId>b.userId?1:0),
    allowedChannels:[...snapshot.allowedChannels].sort(),
    weatherCities:[...snapshot.weatherCities].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),
  };
}
export function snapshotHash(snapshot:EconomySnapshot) {return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');}
export function compareSnapshots(before:EconomySnapshot,after:EconomySnapshot) {
  const changes={addedAccounts:0,removedAccounts:0,changedAccounts:0,changedFields:{} as Record<string,number>,channelsChanged:false,citiesChanged:false};
  const oldAccounts=new Map(before.accounts.map(a=>[a.userId,a])),newAccounts=new Map(after.accounts.map(a=>[a.userId,a]));
  for(const [id,a] of oldAccounts) {
    const b=newAccounts.get(id);if(!b){changes.removedAccounts++;continue;}
    let changed=false;for(const field of ['points','lastLogin','consecutiveDays','gambleDate','gambleCount'] as const)if(a[field]!==b[field]){changed=true;changes.changedFields[field]=(changes.changedFields[field]??0)+1;}
    if(changed)changes.changedAccounts++;
  }
  for(const id of newAccounts.keys())if(!oldAccounts.has(id))changes.addedAccounts++;
  const a=canonical(before),b=canonical(after);
  changes.channelsChanged=JSON.stringify(a.allowedChannels)!==JSON.stringify(b.allowedChannels);
  changes.citiesChanged=JSON.stringify(a.weatherCities)!==JSON.stringify(b.weatherCities);
  return {equal:snapshotHash(before)===snapshotHash(after),...changes};
}
