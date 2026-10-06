export const jstDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month:'2-digit', day:'2-digit' }).format(date);
export function nextLoginTime(now=new Date()) {return new Date(Date.parse(`${jstDate(now)}T00:00:00+09:00`)+86_400_000);}

export function loginReward(days:number,rank:number) {
  const rankBonus=rank===1?30:rank>=2&&rank<=3?20:rank>=4&&rank<=10?10:0;
  return BigInt(30+rankBonus+(days-1)*10);
}
export function loginDay(lastLogin:string|null,consecutive:number,now:Date) {
  return lastLogin===jstDate(new Date(now.getTime()-86_400_000))?consecutive%10+1:1;
}
export function loginForecast(lastLogin:string|null,consecutive:number,rank:number,now=new Date()) {
  const day=lastLogin===jstDate(now)?consecutive:loginDay(lastLogin,consecutive,now);
  return Array.from({length:7},(_,index)=>{
    const offset=index+1;const days=(day+offset-1)%10+1;
    return {offset,days,points:loginReward(days,rank),date:jstDate(new Date(now.getTime()+offset*86_400_000))};
  });
}
