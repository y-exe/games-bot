import {jstDate} from './login.js';

// 破産後のペナルティ: ギャンブル・betの禁止期間と再破産までの期間は、借金の額に応じて伸びる
const bankruptcyBanMin=5,bankruptcyBanMax=100;
const bankruptcyCooldownMin=30,bankruptcyCooldownMax=100;
const bankruptcyScaleBase=1_000_000n,bankruptcyScaleSpan=9_000_000n;

const dateAt=(date:string,days:number)=>jstDate(new Date(Date.parse(`${date}T00:00:00+09:00`)+days*86_400_000));

const scaled=(min:number,max:number,debt:bigint)=>Math.min(max,min+Number((debt-bankruptcyScaleBase)*BigInt(max-min)/bankruptcyScaleSpan));

// −100万ptまでは5日、−1,000万ptで100日、それ以上は100日で打ち止め
export function bankruptcyBanDays(debt:bigint) {
  if(debt<=bankruptcyScaleBase)return bankruptcyBanMin;
  return scaled(bankruptcyBanMin,bankruptcyBanMax,debt);
}

// 再破産までの期間: −100万ptまでは30日、−1,000万ptで100日、それ以上は100日で打ち止め
export function bankruptcyCooldown(debt:bigint) {
  if(debt<=bankruptcyScaleBase)return bankruptcyCooldownMin;
  return scaled(bankruptcyCooldownMin,bankruptcyCooldownMax,debt);
}

export function bankruptcyBanUntil(lastDate:string,days:number) { return dateAt(lastDate,days); }
export function bankruptcyNextDate(lastDate:string,days:number) { return dateAt(lastDate,days); }
