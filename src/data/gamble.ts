import {UserError} from '../errors.js';
import {randomBytes} from 'node:crypto';

export function randomBigInt(min:bigint,max:bigint,entropy=(size:number)=>randomBytes(size)):bigint {
  if(max<min)throw new UserError('抽選範囲が不正です。');
  const range=max-min+1n;if(range===1n)return min;
  const bits=(range-1n).toString(2).length,size=Math.ceil(bits/8),mask=(1n<<BigInt(bits))-1n;
  while(true){const value=BigInt('0x'+entropy(size).toString('hex'))&mask;if(value<range)return min+value;}
}
export function randomUnit(){return Number(randomBigInt(0n,(1n<<53n)-1n))/2**53;}
export function multiplierCents(value:number) {
  if(!Number.isFinite(value))throw new UserError('倍率は有限の数値で指定してください。');
  const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,Math.abs(value));const bits=view.getBigUint64(0);
  const exponent=Number((bits>>52n)&2047n)-1023-52,mantissa=(bits&((1n<<52n)-1n))+(1n<<52n);
  let numerator=mantissa*100n,denominator=1n;
  if(exponent>=0)numerator<<=BigInt(exponent);else denominator<<=BigInt(-exponent);
  let rounded=numerator/denominator;const remainder=numerator%denominator;
  if(remainder*2n>denominator||(remainder*2n===denominator&&rounded%2n===1n))rounded++;
  return Number(rounded)*(value<0?-1:1);
}
export function stakeBounds(current:bigint) {
  if(current>0n)return {min:current/3n||1n,max:current};
  const debt=-current;
  const min=debt/20n,max=debt*98n/900n;
  return {min:min>100n?min:100n,max:max>100n?max:100n};
}

// 借金中の賭け金: 借金の5〜約10.89%の帯から抽選。高めが出やすく、低めに外れる(=失敗)こともある
export function skewedStake(debt:bigint,unit:()=>number) {
  const stake=debt*(50n+BigInt(Math.floor(59*Math.pow(unit(),0.6))))/1000n;
  return stake>100n?stake:100n;
}
export function rollGamble(current:bigint,integer=(min:bigint,max:bigint)=>randomBigInt(min,max),unit=randomUnit) {
  const {min,max}=stakeBounds(current);
  const stake=current>0n?integer(min,max):skewedStake(-current,unit);
  const roll=unit(),lower=roll<.02?5.01:roll<.15?3.01:1.51,upper=roll<.02?10:roll<.15?5:3;
  const base=lower+(upper-lower)*unit();
  // 当たり確率は帯ごとに変え、期待値を0に保つ(1/2 + 1/(2×帯の平均倍率))
  const winRate=roll<.02?.5666:roll<.15?.6248:.7217;
  const sign=unit()<winRate?1:-1;
  const multiplier=multiplierCents(base*sign);
  return {stake,multiplier,delta:stake*BigInt(multiplier)/100n-stake};
}
export function diceDelta(amount:bigint,dice:number) {
  const numerator=[-2,-1,-1,0,1,2][dice-1];if(numerator===undefined)throw new UserError('サイコロの目が不正です。');
  return amount*BigInt(numerator)/2n;
}
