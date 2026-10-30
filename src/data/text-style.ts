import {UserError} from '../errors.js';
import {isTextFont,type TextFont} from './text-fonts.js';
export {textFonts} from './text-fonts.js';

export type TextLayer={kind:'outline';color:string;width:number;opacity:number}|{kind:'shadow';color:string;x:number;y:number;blur:number;spread:number;opacity:number};
export interface TextStyle {
  builtin?:{kind:'text1'|'text2'|'text3'|'text4'|'text5';square:boolean};
  version:1;font:TextFont;italic:boolean;rotation:number;skew:number;spacing:number;lineHeight:number;
  align:'left'|'center'|'right';fit:'contain'|'stretch';width:number;height:number;padding:number;opacity:number;background:string|null;
  fill:{kind:'solid'|'gradient'|'rainbow';colors:string[];angle:number};layers:TextLayer[];
}
export function textStyleFit(style:TextStyle):TextStyle['fit'] {
  return style.builtin?(style.builtin.square||['text4','text5'].includes(style.builtin.kind)?'stretch':'contain'):style.fit;
}
export function toCustomTextStyle(style:TextStyle):TextStyle {
  const result=structuredClone(style);result.fit=textStyleFit(style);
  if(style.builtin) {
    const {kind,square}=style.builtin;
    if(square||['text4','text5'].includes(kind)) {
      result.spacing=(['text4','text5'].includes(kind)?-15:-17)*200/110;
      if(kind==='text1'||kind==='text2')result.layers=[{kind:'outline',color:'#000000',width:15,opacity:1},{kind:'outline',color:'#ffffff',width:12,opacity:1}];
    }
  }
  delete result.builtin;return result;
}
export function hexColor(value:string) {
  if(!/^#[\da-f]{6}$/i.test(value))throw new UserError('色は #e674dc のような6桁のカラーコードで指定してください。');
  return value.toLowerCase();
}
export function numberIn(value:unknown,min:number,max:number,label:string) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new UserError(`${label}は ${min}〜${max} で指定してください。`);
  return value;
}
export function finiteNumber(value:unknown,label:string) {
  if(typeof value!=='number'||!Number.isFinite(value))throw new UserError(`${label}は有限の数値で指定してください。`);
  return value;
}
export function validateTextStyle(value:unknown):TextStyle {
  if(!value||typeof value!=='object')throw new UserError('文字の設定が無効です。');
  const s=value as TextStyle;
  const font=(value as {font?:unknown}).font==='mincho'?'serif':s.font;
  if(s.builtin&&(!/^text[1-5]$/.test(s.builtin.kind)||typeof s.builtin.square!=='boolean'))throw new UserError('標準デザインの設定が無効です。');
  if(s.version!==1||!isTextFont(font)||typeof s.italic!=='boolean'||!['left','center','right'].includes(s.align)||!['contain','stretch'].includes(s.fit))throw new UserError('書体・配置の設定が無効です。');
  const width=numberIn(s.width,256,1000,'画像の幅'),height=numberIn(s.height,256,1000,'画像の高さ');
  if(!Number.isInteger(width)||!Number.isInteger(height))throw new UserError('画像サイズは整数で指定してください。');
  const fill=s.fill;
  if(!fill||!['solid','gradient','rainbow'].includes(fill.kind)||!Array.isArray(fill.colors)||fill.colors.length<1||fill.colors.length>8)throw new UserError('塗りの色は1〜8色で指定してください。');
  if(fill.kind==='gradient'&&fill.colors.length<2)throw new UserError('グラデーションには2色以上を指定してください。');
  if(!Array.isArray(s.layers)||s.layers.length>24)throw new UserError('縁取り・影は合計24層まで追加できます。');
  const layers=s.layers.map((layer):TextLayer=>{
    if(!layer||!['outline','shadow'].includes(layer.kind))throw new UserError('レイヤーの設定が無効です。');
    const color=hexColor(layer.color),opacity=numberIn(layer.opacity,0,1,'レイヤーの不透明度');
    if(layer.kind==='outline')return {kind:'outline',color,opacity,width:numberIn(layer.width,.5,60,'縁取りの太さ')};
    return {kind:'shadow',color,opacity,x:numberIn(layer.x,-100,100,'影の横位置'),y:numberIn(layer.y,-100,100,'影の縦位置'),blur:numberIn(layer.blur,0,20,'影のぼかし'),spread:numberIn(layer.spread,0,40,'影の広がり')};
  });
  if(layers.reduce((n,l)=>n+(l.kind==='outline'?l.width:0),0)>120)throw new UserError('縁取りの太さは合計120px以内にしてください。');
  return {...(s.builtin?{builtin:{kind:s.builtin.kind,square:s.builtin.square}}:{}),version:1,font,italic:s.italic,align:s.align,fit:s.fit,width,height,
    rotation:numberIn(s.rotation,-45,45,'回転'),skew:numberIn(s.skew,-.6,.6,'傾き'),spacing:finiteNumber(s.spacing,'字間'),lineHeight:numberIn(s.lineHeight,.6,2.5,'行間'),
    padding:numberIn(s.padding,0,100,'余白'),opacity:numberIn(s.opacity,0,1,'不透明度'),background:s.background===null?null:hexColor(s.background),
    fill:{kind:fill.kind,colors:fill.colors.map(hexColor),angle:numberIn(fill.angle,-360,360,'グラデーションの角度')},layers};
}
export function defaultTextStyle():TextStyle {
  return {version:1,font:'mochiy',italic:false,rotation:0,skew:0,spacing:0,lineHeight:1.15,align:'center',fit:'contain',width:500,height:500,padding:16,opacity:1,background:null,fill:{kind:'solid',colors:['#e674dc'],angle:90},layers:[{kind:'outline',color:'#ffffff',width:8,opacity:1}]};
}
export function initialTextStyle():TextStyle {
  const style=defaultTextStyle();style.font='gothicblack';style.fill.colors=['#ffff00'];style.fit='stretch';style.layers=[];return style;
}
export function presetTextStyle(kind:string):TextStyle {
  const style=defaultTextStyle();
  if(/^text[1-5]$/.test(kind))style.builtin={kind:kind as NonNullable<TextStyle['builtin']>['kind'],square:true};
  if(kind==='text1'||kind==='text2') {
    style.fill.colors=[kind==='text1'?'#ffff00':'#3296ff'];
    style.layers=[{kind:'outline',color:'#000000',width:7,opacity:1},{kind:'outline',color:'#ffffff',width:5,opacity:1}];
  } else if(kind==='text3') {
    style.font='serif';style.fill.colors=['#c30203'];style.layers=[{kind:'outline',color:'#ffffff',width:7,opacity:1}];
  } else if(kind==='text4') {style.skew=-.2;style.rotation=5.5;style.fit='stretch';style.layers=[{kind:'outline',color:'#ffffff',width:12,opacity:1}];}
  else if(kind==='text5') {style.fill.kind='rainbow';style.fit='stretch';style.layers=[];style.padding=4;}
  return style;
}
