import {UserError} from '../errors.js';
export function transferFee(amount:bigint){return (amount*15n+99n)/100n;}
export function formatAmount(value:bigint|number|string){return (typeof value==='string'?BigInt(value):value).toLocaleString('ja-JP');}
export function positiveAmount(input:string) {
  const normalized=input.trim().replace(/[０-９]/g,c=>String(c.codePointAt(0)!-0xff10));
  if(!/^\+?\d+(?:_\d+)*$/.test(normalized))throw new UserError('金額は正の整数で入力してください。');
  const amount=BigInt(normalized.replaceAll('_',''));
  if(amount<=0n)throw new UserError('金額は1ポイント以上にしてください。');
  return amount;
}
