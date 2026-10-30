import {UserError} from '../errors.js';
import {defaultTextStyle,presetTextStyle,validateTextStyle,type TextStyle,type TextLayer} from './text-style.js';

const numeric=(value:string)=>{
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))throw new UserError('スタイルコードの数値が無効です。');
  return Number(value);
};
export const isTextStyleCode=(value:string)=>/^tc\d+(?:;|$)/i.test(value.trim());
export function encodeTextStyle(input:TextStyle) {
  const s=validateTextStyle(input),defaults=defaultTextStyle();
  if(s.builtin)return `tc1;preset=${s.builtin.kind};square=${s.builtin.square?1:0}`;
  const parts=['tc1',`font=${s.font}`,`fill=${s.fill.colors.join(',')}`];
  if(s.fill.kind!=='solid')parts.push(`paint=${s.fill.kind}`);
  if(s.fill.angle!==90)parts.push(`angle=${s.fill.angle}`);
  if(s.italic)parts.push('italic=1');
  for(const [key,property]of [['rotate','rotation'],['skew','skew'],['space','spacing'],['line','lineHeight'],['pad','padding'],['opacity','opacity']] as const)
    if(s[property]!==defaults[property])parts.push(`${key}=${s[property]}`);
  if(s.width!==500||s.height!==500)parts.push(`size=${s.width}x${s.height}`);
  if(s.align!=='center')parts.push(`align=${s.align}`);
  if(s.fit!=='contain')parts.push(`fit=${s.fit}`);
  if(s.background)parts.push(`bg=${s.background}`);
  const layers=s.layers.map(layer=>{
    if(layer.kind==='outline')return `outline:${layer.color}:${layer.width}${layer.opacity!==1?`:${layer.opacity}`:''}`;
    const fields=[layer.blur,layer.spread,layer.opacity],fallback=[0,0,1];
    while(fields.length&&fields.at(-1)===fallback[fields.length-1])fields.pop();
    return `shadow:${layer.color}:${layer.x}:${layer.y}${fields.length?`:${fields.join(':')}`:''}`;
  });
  parts.push(`layers=${layers.length?layers.join('|'):'none'}`);
  const code=parts.join(';');
  if(code.length>4000)throw new UserError('スタイルコードが長すぎます。設定の小数点以下の桁数を減らしてください。');
  return code;
}
export function decodeTextStyle(input:string):TextStyle {
  if(input.length>4000)throw new UserError('スタイルコードは4000文字以内にしてください。');
  const [version,...parts]=input.trim().split(';');
  if(version?.toLowerCase()!=='tc1')throw new UserError('対応しているスタイルコードは tc1 形式です。');
  const values=new Map<string,string>();
  const allowed=new Set(['preset','square','font','fill','paint','angle','italic','rotate','skew','space','line','pad','opacity','size','align','fit','bg','layers']);
  for(const part of parts) {
    const match=part.trim().match(/^([a-z]+)=(.+)$/);
    if(!match||!allowed.has(match[1]!))throw new UserError('スタイルコードに不明な項目があります。');
    if(values.has(match[1]!))throw new UserError('スタイルコードに同じ項目が重複しています。');
    values.set(match[1]!,match[2]!.trim());
  }
  if(values.has('preset')) {
    const kind=values.get('preset')!;
    if(!/^text[1-5]$/.test(kind)||[...values.keys()].some(k=>!['preset','square'].includes(k)))throw new UserError('標準スタイルのコードを確認してください。');
    const square=values.get('square')??'1';if(!['0','1'].includes(square))throw new UserError('squareは0か1で指定してください。');
    const style=presetTextStyle(kind);style.builtin!.square=square==='1';return validateTextStyle(style);
  }
  if(values.has('square'))throw new UserError('カスタムの正方形化は size=500x500;fit=stretch で指定してください。');
  const style=defaultTextStyle();
  if(values.has('font'))style.font=values.get('font') as TextStyle['font'];
  if(values.has('fill'))style.fill.colors=values.get('fill')!.split(',');
  if(values.has('paint'))style.fill.kind=values.get('paint') as TextStyle['fill']['kind'];
  if(values.has('angle'))style.fill.angle=numeric(values.get('angle')!);
  if(values.has('italic')){const italic=values.get('italic')!;if(!['0','1'].includes(italic))throw new UserError('italicは0か1で指定してください。');style.italic=italic==='1';}
  for(const [key,property]of [['rotate','rotation'],['skew','skew'],['space','spacing'],['line','lineHeight'],['pad','padding'],['opacity','opacity']] as const)
    if(values.has(key))style[property]=numeric(values.get(key)!);
  if(values.has('size')) {
    const match=values.get('size')!.match(/^(\d+)x(\d+)$/);if(!match)throw new UserError('sizeは500x500のように指定してください。');
    style.width=Number(match[1]);style.height=Number(match[2]);
  }
  if(values.has('align'))style.align=values.get('align') as TextStyle['align'];
  if(values.has('fit'))style.fit=values.get('fit') as TextStyle['fit'];
  if(values.has('bg'))style.background=values.get('bg')==='transparent'?null:values.get('bg')!;
  if(values.has('layers'))style.layers=values.get('layers')==='none'?[]:values.get('layers')!.split('|').map((value):TextLayer=>{
    const fields=value.split(':');
    if(fields[0]==='outline'&&fields.length>=3&&fields.length<=4)return {kind:'outline',color:fields[1]!,width:numeric(fields[2]!),opacity:fields[3]!==undefined?numeric(fields[3]):1};
    if(fields[0]==='shadow'&&fields.length>=4&&fields.length<=7)return {kind:'shadow',color:fields[1]!,x:numeric(fields[2]!),y:numeric(fields[3]!),blur:fields[4]!==undefined?numeric(fields[4]):0,spread:fields[5]!==undefined?numeric(fields[5]):0,opacity:fields[6]!==undefined?numeric(fields[6]):1};
    throw new UserError('縁取り・影のスタイルコードが無効です。');
  });
  return validateTextStyle(style);
}
