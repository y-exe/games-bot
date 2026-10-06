import {UserError,ServiceError} from '../errors.js';
import { settings } from '../config.js';
const cached=new Map<string,{value:unknown;expires:number}>();
const pending=new Map<string,Promise<unknown>>();
export async function cachedFetch<T>(key:string,ttl:number,work:()=>Promise<T>):Promise<T> {
  const existing=cached.get(key);if(existing&&existing.expires>Date.now())return existing.value as T;
  if(pending.has(key))return pending.get(key) as Promise<T>;
  const request=work().then(value=>{for(const [k,v]of cached)if(v.expires<Date.now())cached.delete(k);if(cached.size>=100)cached.delete(cached.keys().next().value!);cached.set(key,{value,expires:Date.now()+ttl});return value;}).finally(()=>pending.delete(key));
  pending.set(key,request);return request;
}
export async function request(url:string,init:RequestInit={}) {
  try{const response=await fetch(url,{...init,signal:AbortSignal.timeout(25_000)});if(!response.ok)throw new ServiceError(`外部サービスが HTTP ${response.status} を返しました。時間をおいて再試行してください。`,response.status);return response;}
  catch(e){if(e instanceof ServiceError)throw e;throw new ServiceError('外部サービスとの通信がタイムアウトまたは失敗しました。再試行してください。',undefined,e);}
}
export async function deepseek(prompt:string,limits:{maxTokens?:number;maxCharacters?:number}={}) {
  if(!settings.deepseekKey)throw new UserError('AI機能のAPIキーが未設定です。DEEPSEEK_API_KEYを設定してください。');
  const response=await request('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${settings.deepseekKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:limits.maxTokens??800,temperature:0.3})});
  const json=await response.json() as {choices?:{message:{content:string}}[]};const text=json.choices?.[0]?.message.content;if(!text)throw new UserError('AIから応答を取得できませんでした。');return text.slice(0,limits.maxCharacters??3000);
}
let cities:Map<string,string>|undefined;
export async function weatherCities() {
  if(cities)return cities;
  const xml=await (await request('https://weather.tsukumijima.net/primary_area.xml')).text();
  const map=new Map<string,string>();
  for(const match of xml.matchAll(/<city\b([^>]+)>?/g)) {
    const attrs=Object.fromEntries([...match[1]!.matchAll(/([\w]+)="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    if(attrs.title&&attrs.id)map.set(attrs.title,attrs.id);
  }
  if(!map.size)throw new UserError('天気の都市一覧を取得できませんでした。');cities=map;return map;
}
export interface Forecast { location:{city:string};forecasts:{dateLabel:string;date:string;telop:string;temperature:{max:{celsius:string|null}|null;min:{celsius:string|null}|null}}[];publicTime:string }
function temperature(value:unknown):{celsius:string}|null {
  const text=typeof value==='number'?String(value):typeof value==='string'?value.trim():'';
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)&&Number.isFinite(Number(text))?{celsius:text}:null;
}
export function parseForecast(input:unknown,fallbackCity:string):Forecast {
  const raw=input as (Partial<Forecast>&{error?:unknown})|null;
  if(!raw||raw.error||!Array.isArray(raw.forecasts)||!raw.forecasts.length)throw new UserError('天気情報を取得できませんでした。時間をおいて再試行してください。');
  const forecasts=raw.forecasts.filter(f=>f&&typeof f==='object'&&!Array.isArray(f)).slice(0,3).map(f=>({
    dateLabel:typeof f.dateLabel==='string'?f.dateLabel:'予報',date:typeof f.date==='string'?f.date:'日付不明',telop:typeof f.telop==='string'?f.telop:'天候不明',
    temperature:{max:temperature(f.temperature?.max?.celsius),min:temperature(f.temperature?.min?.celsius)},
  }));
  if(!forecasts.length)throw new UserError('天気情報を取得できませんでした。時間をおいて再試行してください。');
  return {location:{city:typeof raw.location?.city==='string'&&raw.location.city.trim()?raw.location.city:fallbackCity},forecasts,publicTime:typeof raw.publicTime==='string'?raw.publicTime:''};
}
export async function weather(query:string) {
  if(!query.trim())throw new UserError('都市名を指定してください。例: tenki 東京');
  const cities=await weatherCities();const normalized=query.normalize('NFKC').replace(/[市区]$/,'');
  let id=cities.get(normalized);
  if(!id){const matches=[...cities].filter(([name])=>name.includes(normalized)||normalized.includes(name));if(matches.length===1)id=matches[0]![1];}
  if(!id&&settings.deepseekKey){const guess=await deepseek(`日本の地名「${query}」に近い都市を次の一覧から選び6桁のIDのみを返してください。見つからなければ不明。\n${[...cities].map(([n,id])=>`${n}:${id}`).join('\n')}`);if([...cities.values()].includes(guess.trim()))id=guess.trim();}
  if(!id)throw new UserError('都市が見つかりません。東京・大阪・福岡などの都市名を指定してください。');
  return cachedFetch<Forecast>(`weather:${id}`,600_000,async()=>parseForecast(await(await request(`https://weather.tsukumijima.net/api/forecast/city/${id}`)).json(),query));
}
