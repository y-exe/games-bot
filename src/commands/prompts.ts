import { ButtonStyle, CheckboxBuilder, ComponentType, FileUploadBuilder, LabelBuilder, ModalBuilder, RadioGroupBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, type ButtonInteraction, type Client, type ModalSubmitInteraction, type SelectMenuModalData, type TextInputModalData } from 'discord.js';
import { Context } from './context.js';
import { card, button, row } from '../ui/cards.js';
import { emoji } from '../ui/emojis.js';
import { UserError } from '../errors.js';
import { exceptionCard, isPublicChannel } from '../ui/errors.js';

interface PromptField {
  kind:'text'|'file'|'checkbox'|'radio'|'select'|'user';
  id:string;label:string;
  required?:boolean;maxLength?:number;paragraph?:boolean;placeholder?:string;
  minValues?:number;maxValues?:number;
  options?:{label:string;value:string;default?:boolean}[];
}
interface PromptSpec { title:string;body:string;example:string;fields:PromptField[] }

const text=(id:string,label:string,spec:Partial<PromptField>={}):PromptField=>({kind:'text',id,label,paragraph:true,maxLength:200,...spec});
const currencyOptions=(['USD · 米ドル','EUR · ユーロ','CNY · 人民元','KRW · 韓国ウォン','GBP · 英ポンド','AUD · 豪ドル','CAD · カナダドル','HKD · 香港ドル','TWD · 台湾ドル','SGD · シンガポールドル','THB · バーツ','CHF · スイスフラン','MXN · メキシコペソ','BRL · ブラジルレアル','INR · ルピー','RUB · ルーブル','NZD · NZドル','PHP · フィリピンペソ','VND · ドン','MYR · リンギット','IDR · ルピア','ZAR · ランド','PLN · ズウォティ','SEK · クローナ','NOK · クローネ']).map(entry=>({label:entry,value:entry.split(' · ')[0]!,default:entry.startsWith('USD')}));
const countryOptions=(code:string,label:string)=>({label:`${code} · ${label}`,value:code,default:code==='JP'});
export const promptSpecs:Record<string,PromptSpec>={
  voice:{title:'音声の用意',example:'voice こんにちは',body:'**読み上げる文字** か **音声ファイル** のどちらかをフォームで送ります。\n-# 両方入れると音声ファイルを優先します。45秒以内 · 10MB以下。\n-# 対応形式: wav・mp3・flac・m4a・ogg',
    fields:[text('text','読み上げる文字（任意）',{placeholder:'空欄なら音声ファイルだけを変換します',maxLength:200}),
      {kind:'file',id:'audio',label:'音声ファイル（任意）'}]},
  text:{title:'文字画像の用意',example:'text やまかわ,かわいい',body:'画像にする文字をフォームで送ります。\n-# コンマ `,` で改行になります。',
    fields:[text('text','画像にする文字',{required:true,placeholder:'1行目,2行目,3行目'}),{kind:'checkbox',id:'square',label:'正方形スタンプにする'}]},
  text2:{title:'青文字の用意',example:'text2 やまかわ,かわいい',body:'画像にする文字をフォームで送ります。\n-# コンマ `,` で改行になります。',
    fields:[text('text','画像にする文字',{required:true,placeholder:'1行目,2行目,3行目'}),{kind:'checkbox',id:'square',label:'正方形スタンプにする'}]},
  text3:{title:'赤文字の用意',example:'text3 やまかわ,かわいい',body:'画像にする文字をフォームで送ります。\n-# コンマ `,` で改行になります。',
    fields:[text('text','画像にする文字',{required:true,placeholder:'1行目,2行目,3行目'}),{kind:'checkbox',id:'square',label:'正方形スタンプにする'}]},
  text4:{title:'変形スタンプの用意',example:'text4 かわいい square',body:'スタンプにする文字をフォームで送ります。\n-# この文字は正方形スタンプ専用です。',
    fields:[text('text','スタンプにする文字',{required:true,placeholder:'1行目,2行目'})]},
  text5:{title:'虹色スタンプの用意',example:'text5 かわいい square',body:'スタンプにする文字をフォームで送ります。\n-# この文字は正方形スタンプ専用です。',
    fields:[text('text','スタンプにする文字',{required:true,placeholder:'1行目,2行目'})]},
  '5000':{title:'5000兆円画像の用意',example:'5000 5000兆円 欲しい！',body:'上下の文字をフォームで送ります。',
    fields:[text('top','上の文字',{required:true,paragraph:false,maxLength:30,placeholder:'5000兆円'}),text('bottom','下の文字',{required:true,paragraph:false,maxLength:30,placeholder:'欲しい！'}),
      {kind:'checkbox',id:'hoshii',label:'「欲しい！」を追加'},{kind:'checkbox',id:'rainbow',label:'虹色にする'}]},
  watermark:{title:'画像加工の用意',example:'watermark ＋画像を添付',body:'テンプレートを合成する画像をフォームで送ります。\n-# 10MB以下の画像に対応。',
    fields:[{kind:'file',id:'image',label:'加工する画像',required:true,minValues:1,maxValues:1}]},
  gaming:{title:'ゲーミングGIFの用意',example:'gaming ＋画像を添付',body:'七色に光らせる画像をフォームで送ります。\n-# 10MB以下。カラー画像が向いています。',
    fields:[{kind:'file',id:'image',label:'GIFにする画像',required:true,minValues:1,maxValues:1}]},
  tenki:{title:'天気予報の用意',example:'tenki 東京',body:'見たい都市をフォームで送ります。',
    fields:[text('city','都市名',{required:true,paragraph:false,maxLength:20,placeholder:'東京・大阪・札幌など'})]},
  rate:{title:'為替換算の用意',example:'rate 100 USD',body:'金額と通貨をフォームで送ります。',
    fields:[text('amount','外貨の金額',{required:true,paragraph:false,maxLength:25,placeholder:'100'}),{kind:'select',id:'currency',label:'通貨',options:currencyOptions}]},
  bet:{title:'ダイスベットの用意',example:'bet 30',body:'賭け金をフォームで送ります。',
    fields:[text('amount','賭け金（ポイント）',{required:true,paragraph:false,maxLength:25,placeholder:'100'})]},
  totusi:{title:'突然の死の用意',example:'totusi すごい',body:'中央に表示する文字をフォームで送ります。',
    fields:[text('text','表示する文字',{required:true,maxLength:150,placeholder:'突然の死'})]},
  give:{title:'送金の用意',example:'give @相手 100',body:'送金先と金額をフォームで送ります。\n-# 送信後にもう一度確認があります。',
    fields:[{kind:'user',id:'user',label:'送金先',minValues:1,maxValues:1},text('amount','送金額（ポイント）',{required:true,paragraph:false,maxLength:25,placeholder:'100'})]},
  time:{title:'時計の用意',example:'time US',body:'見たい国・地域をフォームで選んで送ります。',
    fields:[{kind:'select',id:'country',label:'国・地域',options:[countryOptions('JP','東京'),countryOptions('US','ニューヨーク'),countryOptions('GB','ロンドン'),countryOptions('UK','ロンドン'),countryOptions('CN','上海'),countryOptions('KR','ソウル'),countryOptions('TW','台北'),countryOptions('AU','シドニー'),countryOptions('DE','ベルリン'),countryOptions('FR','パリ'),countryOptions('RU','モスクワ'),countryOptions('BR','サンパウロ'),countryOptions('IN','コルカタ'),countryOptions('CA','トロント'),countryOptions('SG','シンガポール')]}]},
};

export function needsPrompt(name:string,ctx:Context):boolean {
  if(!promptSpecs[name])return false;
  switch(name) {
    case 'voice':return !ctx.args.length&&!ctx.attachment();
    case 'watermark':case 'gaming':return !ctx.attachment();
    case '5000':case 'rate':case 'give':return ctx.args.length<2;
    default:return !ctx.args.length;
  }
}

export function promptCard(name:string) {
  const spec=promptSpecs[name];
  if(!spec)return card('フォームを開けません','コマンドを開き直してください。','warning');
  return card(`${spec.title}`,`${spec.body}\n\n下のボタンからフォームを開けます。\n-# フォームを使わず \`${spec.example}\` のように直接入力しても実行できます。`,'pending',[row(button(`prompt:${name}`,'フォームを開く',ButtonStyle.Primary,emoji('status_info')))],'フォームの送信までは何も実行されません');
}

export function buildModal(name:string):ModalBuilder|undefined {
  const spec=promptSpecs[name];if(!spec)return undefined;
  const modal=new ModalBuilder().setCustomId(`prompt:${name}`).setTitle(spec.title);
  for(const field of spec.fields) {
    const label=new LabelBuilder().setLabel(field.label);
    if(field.kind==='text') {
      const input=new TextInputBuilder().setCustomId(field.id).setStyle(field.paragraph?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(field.required??false).setMaxLength(field.maxLength??400);
      if(field.placeholder)input.setPlaceholder(field.placeholder);
      label.setTextInputComponent(input);
    } else if(field.kind==='file') {
      label.setFileUploadComponent(new FileUploadBuilder({custom_id:field.id}).setMinValues(field.minValues??0).setMaxValues(field.maxValues??1).setRequired(field.required??false));
    } else if(field.kind==='checkbox') {
      label.setCheckboxComponent(new CheckboxBuilder().setCustomId(field.id));
    } else if(field.kind==='select') {
      label.setStringSelectMenuComponent(new StringSelectMenuBuilder().setCustomId(field.id).setMinValues(1).setMaxValues(1).addOptions(...(field.options??[]).map(option=>({label:option.label,value:option.value,default:option.default}))));
    } else if(field.kind==='radio') {
      label.setRadioGroupComponent(new RadioGroupBuilder().setCustomId(field.id).addOptions(...(field.options??[]).map(option=>({label:option.label,value:option.value,default:option.default}))));
    } else {
      label.setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId(field.id).setMinValues(field.minValues??1).setMaxValues(field.maxValues??1));
    }
    modal.addComponents(label);
  }
  return modal;
}

function fieldOf(i:ModalSubmitInteraction,id:string) {
  for(const data of i.fields.fields.values())if(data.customId===id)return data;
  return undefined;
}
function textValue(i:ModalSubmitInteraction,id:string){const data=fieldOf(i,id);return data?.type===ComponentType.TextInput?(data as TextInputModalData).value:'';}
function checked(i:ModalSubmitInteraction,id:string){const data=fieldOf(i,id);return data?.type===ComponentType.Checkbox?data.value:false;}
function selectValue(i:ModalSubmitInteraction,id:string){const data=fieldOf(i,id);return data?.type===ComponentType.StringSelect||data?.type===ComponentType.UserSelect?(data as SelectMenuModalData).values[0]:undefined;}
function selectedUser(i:ModalSubmitInteraction,id:string){return selectValue(i,id);}

export function promptArgs(name:string,i:ModalSubmitInteraction):string[] {
  switch(name) {
    case 'voice':{const value=textValue(i,'text').trim();return value?[value]:[];}
    case 'text':case 'text2':case 'text3':case 'text4':case 'text5':{
      const value=textValue(i,'text').trim();
      const stampOnly=name==='text4'||name==='text5';
      const square=stampOnly||checked(i,'square');
      return value?[square?`${value} square`:value]:[];
    }
    case '5000':{
      const args=[textValue(i,'top').trim(),textValue(i,'bottom').trim()];
      if(checked(i,'hoshii'))args.push('hoshii');
      if(checked(i,'rainbow'))args.push('rainbow');
      return args;
    }
    case 'tenki':{const value=textValue(i,'city').trim();return value?[value]:[];}
    case 'rate':{const amount=textValue(i,'amount').trim();const currency=(selectValue(i,'currency')??textValue(i,'currency')).trim().toUpperCase();return [amount,currency];}
    case 'time':{const country=selectValue(i,'country');return country?[country]:[];}
    case 'bet':{const value=textValue(i,'amount').trim();return value?[value]:[];}
    case 'totusi':{const value=textValue(i,'text').trim();return value?[value]:[];}
    case 'give':{
      const user=selectedUser(i,'user');const amount=textValue(i,'amount').trim();
      if(!user)throw new UserError('送金先を選んでください。');
      return [user,amount];
    }
    default:return [];
  }
}

export async function handlePromptSubmit(i:ModalSubmitInteraction,deps:{client:Client;allowed:Set<string>;execute:(name:string,ctx:Context)=>Promise<unknown>}) {
  const name=i.customId.split(':')[1]??'';
  if(!promptSpecs[name])throw new UserError('このフォームは使えなくなりました。コマンドを開き直してください。');
  if(!deps.allowed.has(i.channelId??''))throw new UserError('このチャンネルではBot利用が**停止されています。**\n管理者が `setchannel` で再開できます。');
  const ctx=new Context(i,deps.client,promptArgs(name,i));
  try {await deps.execute(name,ctx);}
  catch(e) {
    try {await ctx.fail(exceptionCard(e,`フォーム:${name}`),!(e instanceof UserError)&&!isPublicChannel(i.channelId??''));}
    catch {console.error('フォームのエラー通知を送信できませんでした。');}
  }
}

export async function openPrompt(i:ButtonInteraction) {
  const name=i.customId.split(':')[1]??'';
  const modal=buildModal(name);
  if(!modal)throw new UserError('このフォームは使えなくなりました。コマンドを開き直してください。');
  await i.showModal(modal);
}