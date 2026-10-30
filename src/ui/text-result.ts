import {AttachmentBuilder} from 'discord.js';
import {card} from './cards.js';

export const textResultStyles:Record<string,{title:string;color:number}>={
  text1:{title:'テキスト1 (黄色)',color:0xfee75c},
  text2:{title:'テキスト2 (青色)',color:0x3498db},
  text3:{title:'テキスト3 (赤色・明朝体)',color:0xc30203},
  text4:{title:'テキスト4 (変形)',color:0xe674dc},
  text5:{title:'テキスト5 (虹色)',color:0x3498db},
  textc:{title:'カスタムテキスト',color:0xe674dc},
};
export function textResultPayload(kind:string,text:string,bytes:Buffer,size={width:500,height:500}) {
  const style=textResultStyles[kind]??textResultStyles.textc!;
  const echo=text.trim()?`**文字** · ${text.trim().replaceAll('`','´').replaceAll('\n',' / ').slice(0,60)}\n`:'';
  const detail=kind==='textc'?`-# カスタム文字画像 · ${size.width} × ${size.height}px`:['text4','text5'].includes(kind)?'-# スタンプ専用 · 500 × 500px':'-# 改行はコンマ `,` · 正方形スタンプは `square` を指定';
  return {...card(style.title,echo+detail,'success',[],undefined,'attachment://image.png',undefined,style.color),files:[new AttachmentBuilder(bytes,{name:'image.png'})]};
}
