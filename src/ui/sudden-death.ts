import {UserError} from '../errors.js';
import {wideRanges} from './wide-ranges.js';

export function eastAsianWidth(character:string) {
  const point=character.codePointAt(0)!;let lo=0,hi=wideRanges.length-1;
  while(lo<=hi){const mid=(lo+hi)>>>1,[start,end]=wideRanges[mid]!;if(point<start)hi=mid-1;else if(point>end)lo=mid+1;else return 2;}
  return 1;
}
export function suddenDeath(text:string) {
  const clean=text.replaceAll('　',' ');
  if(!clean.trim())throw new UserError('文字を指定してください。例: totusi すごい');
  const width=[...clean].reduce((n,c)=>n+eastAsianWidth(c),0);
  const count=Math.min(15,Math.max(3,Math.ceil(width/1.5)));
  return `＿${'人'.repeat(count)}＿\n＞　**${clean}**　＜\n￣${'Y^'.repeat(Math.floor(count/2))}${count%2?'Y':''}${'^Y'.repeat(Math.floor(count/2))}￣`;
}
