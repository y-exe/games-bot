import {jstDate} from './login.js';

// 破産後のペナルティ期間は借金の額に応じて、桁を追うごとにゆるやかに伸びる
const bankruptcyBanMin=5,bankruptcyCooldownMin=30,bankruptcyMax=100;
const bankruptcyLogMin=6,bankruptcyLogMax=15; // −100万pt で最短、−1,000兆pt で最長

const dateAt=(date:string,days:number)=>jstDate(new Date(Date.parse(`${date}T00:00:00+09:00`)+days*86_400_000));

const scaled=(min:number,max:number,debt:bigint)=>{
  if(debt<=1_000_000n)return min;
  const t=Math.min(1,Math.max(0,(Math.log10(Number(debt))-bankruptcyLogMin)/(bankruptcyLogMax-bankruptcyLogMin)));
  return Math.round(min+(max-min)*t);
};

// ギャンブル・bet禁止: −100万ptで5日、−1,000兆ptで100日
export function bankruptcyBanDays(debt:bigint) { return scaled(bankruptcyBanMin,bankruptcyMax,debt); }

// 再破産までの期間: −100万ptで30日、−1,000兆ptで100日
export function bankruptcyCooldown(debt:bigint) { return scaled(bankruptcyCooldownMin,bankruptcyMax,debt); }

export function bankruptcyBanUntil(lastDate:string,days:number) { return dateAt(lastDate,days); }
export function bankruptcyNextDate(lastDate:string,days:number) { return dateAt(lastDate,days); }
