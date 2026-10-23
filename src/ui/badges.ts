import {UserFlags} from 'discord.js';

const flagBadges:[number,string][]=[
  [UserFlags.Staff,'b_staff'],[UserFlags.Partner,'b_partner'],[UserFlags.Hypesquad,'b_hype_events'],
  [UserFlags.HypeSquadOnlineHouse1,'b_hype_bravery'],[UserFlags.HypeSquadOnlineHouse2,'b_hype_brilliance'],[UserFlags.HypeSquadOnlineHouse3,'b_hype_balance'],
  [UserFlags.PremiumEarlySupporter,'b_early_supporter'],[UserFlags.VerifiedDeveloper,'b_early_bot_dev'],
  [UserFlags.CertifiedModerator,'b_mod_alumni'],[UserFlags.ActiveDeveloper,'b_active_dev'],
];
export function publicBadgeNames(flags:{has(flag:number):boolean}|null|undefined) {
  if(!flags)return [];
  const names=flagBadges.filter(([flag])=>flags.has(flag)).map(([,name])=>name);
  if(flags.has(UserFlags.BugHunterLevel2))names.push('b_bug_hunter_gold');
  else if(flags.has(UserFlags.BugHunterLevel1))names.push('b_bug_hunter_green');
  return names;
}

export function elapsedCalendarMonths(start:Date|number,now=new Date()):number|undefined {
  const from=new Date(start),until=now.getTime();
  if(!Number.isFinite(from.getTime())||!Number.isFinite(until)||from.getTime()>until)return undefined;
  let months=(now.getUTCFullYear()-from.getUTCFullYear())*12+now.getUTCMonth()-from.getUTCMonth();
  const year=now.getUTCFullYear(),month=now.getUTCMonth();
  const day=Math.min(from.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  const anniversary=Date.UTC(year,month,day,from.getUTCHours(),from.getUTCMinutes(),from.getUTCSeconds(),from.getUTCMilliseconds());
  if(until<anniversary)months--;
  return Math.max(0,months);
}
export function durationText(months:number) {
  const years=Math.floor(months/12),remaining=months%12;
  return years?`${years}年${remaining?`${remaining}か月`:''}`:`${remaining}か月`;
}
export function accountAgeBadge(created:Date|number,now=new Date()) {
  const months=elapsedCalendarMonths(created,now);
  if(months===undefined)return undefined;
  const years=Math.floor(months/12);
  return {months,text:durationText(months),name:years>=1?`b_account_age_${Math.min(years,10)}`:undefined};
}
export function serverBoostBadge(start:Date|number|null|undefined,now=new Date()) {
  if(start===null||start===undefined)return undefined;
  const months=elapsedCalendarMonths(start,now);if(months===undefined)return undefined;
  const thresholds=[0,2,3,6,9,12,15,18,24];
  const tier=thresholds.filter(threshold=>months>=threshold).length;
  return {months,text:durationText(months),name:`b_boost_${tier}`};
}
