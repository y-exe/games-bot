import {jstDate} from './login.js';

// 破産後のペナルティ: ギャンブル・betの禁止期間は固定、再破産までの期間は借金の額に応じて伸びる
export const bankruptcyBanDays=14;
const bankruptcyCooldownMin=30,bankruptcyCooldownMax=100;
const bankruptcyCooldownBase=1_000_000n,bankruptcyCooldownSpan=9_000_000n;

const dateAt=(date:string,days:number)=>jstDate(new Date(Date.parse(`${date}T00:00:00+09:00`)+days*86_400_000));

export function bankruptcyBanUntil(lastDate:string) { return dateAt(lastDate,bankruptcyBanDays); }

// −100万ptまでは30日、−1,000万ptで100日、それ以上は100日で打ち止め
export function bankruptcyCooldown(debt:bigint) {
  if(debt<=bankruptcyCooldownBase)return bankruptcyCooldownMin;
  const extra=(debt-bankruptcyCooldownBase)*BigInt(bankruptcyCooldownMax-bankruptcyCooldownMin)/bankruptcyCooldownSpan;
  return Math.min(bankruptcyCooldownMax,bankruptcyCooldownMin+Number(extra));
}

export function bankruptcyNextDate(lastDate:string,days:number) { return dateAt(lastDate,days); }
