import {UserError} from '../errors.js';
const decimalDigits='\\d(?:_?\\d)*';
const decimalNumber=new RegExp(`^[+-]?(?:${decimalDigits}(?:\\.(?:${decimalDigits})?)?|\\.${decimalDigits})(?:[eE][+-]?${decimalDigits})?$`);
function decimal(value:string):number {
  const normalized=value.trim().replace(/[０-９]/g,c=>String(c.codePointAt(0)!-0xff10));
  if(!decimalNumber.test(normalized))return NaN;
  return Number(normalized.replaceAll('_',''));
}
export function exchangeInput(input:string|number,currency:string) {
  const amount=typeof input==='number'?input:decimal(input),code=currency.trim().toUpperCase();
  if(!Number.isFinite(amount)||!/^[A-Z]{3}$/.test(code))throw new UserError('金額と3文字の通貨コードを指定してください。例: rate 100 USD');
  return {amount,code};
}
export function exchangeQuote(amount:number,code:string,data:unknown) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw new UserError('為替APIから有効なレートを取得できませんでした。時間をおいて再試行してください。');
  const rates=data as Record<string,unknown>,key=`${code}_JPY`;
  if(!Object.hasOwn(rates,key))throw new UserError('その通貨は対応していません。USD・EURなどを指定してください。');
  const raw=rates[key],rate=typeof raw==='number'?raw:typeof raw==='string'?decimal(raw):NaN;
  if(!Number.isFinite(rate)||rate<=0)throw new UserError('為替APIのレートが無効です。時間をおいて再試行してください。');
  const yen=amount*rate;
  if(!Number.isFinite(yen))throw new UserError('換算結果が大きすぎます。金額を小さくして再試行してください。');
  return {rate,yen,updated:typeof rates.datetime==='string'?rates.datetime:''};
}
