import type { AutocompleteInteraction } from 'discord.js';
import { timezones } from './utility.js';
import { weatherCities } from '../services/network.js';

export interface Suggestion { name: string; value: string }

const popularCities=['東京','大阪','横浜','名古屋','札幌','福岡','神戸','京都','広島','仙台','那覇','新潟','熊本','静岡','岡山'];
const cityLabels:Record<string,string>={JP:'東京',US:'ニューヨーク',GB:'ロンドン',UK:'ロンドン',CN:'上海',KR:'ソウル',TW:'台北',AU:'シドニー',DE:'ベルリン',FR:'パリ',RU:'モスクワ',BR:'サンパウロ',IN:'コルカタ',CA:'トロント',SG:'シンガポール'};
const currencies:Suggestion[]=[
  ['USD','米ドル'],['EUR','ユーロ'],['CNY','人民元'],['KRW','韓国ウォン'],['GBP','英ポンド'],['AUD','豪ドル'],['CAD','カナダドル'],['HKD','香港ドル'],['TWD','台湾ドル'],['SGD','シンガポールドル'],
  ['THB','バーツ'],['CHF','スイスフラン'],['MXN','メキシコペソ'],['BRL','ブラジルレアル'],['INR','ルピー'],['RUB','ルーブル'],['NZD','NZドル'],['PHP','フィリピンペソ'],['VND','ドン'],['MYR','リンギット'],
  ['IDR','ルピア'],['ZAR','ランド'],['PLN','ズウォティ'],['SEK','クローナ'],['NOK','クローネ'],['TRY','リラ'],
].map(([value,name])=>({name:`${value!} · ${name!}`,value:value!}));
const amounts:Suggestion[]=[1,10,100,500,1000,5000,10000,50000,100000].map(n=>({name:`${n.toLocaleString('ja-JP')}pt`,value:String(n)}));

export function pick(query:string,suggestions:Suggestion[],limit=25):Suggestion[] {
  const q=query.trim().toLowerCase();
  const digits=q.replace(/[^0-9]/g,'');
  const matched=q?suggestions.filter(s=>s.name.toLowerCase().includes(q)||s.value.toLowerCase().includes(q)||(digits&&s.value.replace(/[^0-9]/g,'').includes(digits))):suggestions;
  return cap(matched,limit);
}

export function cap(suggestions:Suggestion[],limit=25):Suggestion[] {
  const seen=new Set<string>();
  const result:Suggestion[]=[];
  for(const suggestion of suggestions) {
    if(seen.has(suggestion.name))continue;
    seen.add(suggestion.name);result.push(suggestion);
    if(result.length>=limit)break;
  }
  return result;
}

export function countrySuggestions():Suggestion[] {
  return Object.entries(timezones).map(([code,tz])=>({name:`${code} · ${cityLabels[code]??tz.split('/').at(-1)!.replaceAll('_',' ')}`,value:code}));
}

export async function citySuggestions(query:string):Promise<Suggestion[]> {
  const q=query.normalize('NFKC').replace(/[市区]$/,'').trim();
  try {
    const cities=await weatherCities();
    const names=[...cities.keys()];
    const base=q?names.filter(name=>name.includes(q)||q.includes(name)):popularCities.filter(city=>cities.has(city));
    return cap(base.map(name=>({name,value:name})));
  } catch {
    return pick(query,popularCities.map(name=>({name,value:name})));
  }
}

export async function handleAutocomplete(i:AutocompleteInteraction,recentEdits:(channelId:string)=>{id:string;title:string;at:number}[]) {
  const focused=i.options.getFocused(true);
  let options:Suggestion[]=[];
  switch(i.commandName) {
    case 'tenki': if(focused.name==='city')options=await citySuggestions(focused.value); break;
    case 'rate': if(focused.name==='currency')options=pick(focused.value,currencies); break;
    case 'time': if(focused.name==='country')options=pick(focused.value,countrySuggestions()); break;
    case 'bet': case 'give': case 'highlow': if(focused.name==='amount')options=pick(focused.value,amounts); break;
    case 'embed': if(focused.name==='message_id')options=pick(focused.value,recentEdits(i.channelId??'').map(entry=>({name:`${entry.title} (${entry.id})`,value:entry.id}))); break;
  }
  await i.respond(options);
}