import {jstDate} from './login.js';

// 破産後のペナルティ: ギャンブル・betの禁止期間と、再破産までのクールダウン
export const bankruptcyBanDays=14,bankruptcyCooldownDays=90;

const dateAt=(date:string,days:number)=>jstDate(new Date(Date.parse(`${date}T00:00:00+09:00`)+days*86_400_000));

export function bankruptcyBanUntil(lastDate:string) { return dateAt(lastDate,bankruptcyBanDays); }
export function bankruptcyNextDate(lastDate:string) { return dateAt(lastDate,bankruptcyCooldownDays); }
