import {ActionRowBuilder,ButtonStyle,StringSelectMenuBuilder} from 'discord.js';
import {card,button,row,type CardRow} from './cards.js';
import {textFonts,textStyleFit,toCustomTextStyle,type TextStyle} from '../data/text-style.js';
import {encodeTextStyle} from '../data/text-style-code.js';
import {emoji} from './emojis.js';

export interface TextDraft {
  owner:string;channelId:string;expires:number;text:string;style:TextStyle;screen:'hub'|'editor'|'library';
  preset?:string;square:boolean;selected:number;page:number;busy:boolean;preview?:Buffer;templateId?:string;templateName?:string;notice?:string;
}
const textPresets=['text1','text2','text3','text4','text5'] as const;
const select=(id:string,placeholder:string,options:{label:string;value:string;default?:boolean}[])=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
export function textStudioCard(key:string,d:TextDraft) {
  const id=(action:string)=>`txt:${key}:${action}`;
  if(d.screen==='hub')return card('文字画像を作る','**使いたい文字の種類を選んでください。**\n文字は選択後にも変更できます。\n自分だけのデザインは「カスタムを作る」から。','info',[
    row(...textPresets.map(kind=>button(id(kind),kind,ButtonStyle.Secondary,emoji(kind)))),
    row(button(id('custom'),'カスタムを作る',ButtonStyle.Success),button(id('library'),'保存済みテンプレート'),button(id('import'),'共有コードから追加')),
  ]);
  const s=toCustomTextStyle(d.style),fit=textStyleFit(d.style);
  const code=encodeTextStyle(d.style);
  const info=[`**文字** · ${d.text.replaceAll('`','ˋ').slice(0,140)}`,
    `**書体** · ${textFonts[s.font]}${s.italic?' · 斜体':''} · **サイズ** ${s.width} × ${s.height}`,
    `**塗り** · ${s.fill.kind==='rainbow'?'虹色':s.fill.colors.join(' → ')} · **背景** ${s.background??'透過'}`,
    `**字間** · ${s.spacing} / **行間** · ${s.lineHeight}倍 / **比率** · ${fit==='stretch'?'引き伸ばし':'維持'}`,
    `**レイヤー** · 縁取り ${s.layers.filter(l=>l.kind==='outline').length}層 / 影 ${s.layers.filter(l=>l.kind==='shadow').length}層`,
    ...(d.preset?[`-# ${d.preset}の既定デザイン。設定を変更するとカスタムに切り替わります。`]:[]),
    `**スタイルコード** · \`${code.length>100?`${code.slice(0,97)}…`:code}\`\n-# 設定を復元できるコードです。「コードを表示」から全文をコピーできます。`,
    ...(d.notice?[d.notice]:[]),
    '-# 自分だけが操作できます。縁取りは上から内側→外側、レイヤーは下から描画します。',
    '-# 編集画面は本人限定です。「画像を生成」で完成画像をチャンネルに公開します。',
  ].join('\n');
  const rows:CardRow[]=[select(id('font'),'フォントを選択',Object.entries(textFonts).map(([value,label])=>({label,value,default:s.font===value}))),
    row(button(id('edittext'),'文字',ButtonStyle.Primary),button(id('paint'),'塗り・背景'),button(id('format'),'字間・行間・傾き'),button(id('layout'),'サイズ・配置')),
    row(button(id('addoutline'),'縁取りを追加'),button(id('addshadow'),'影を追加'),button(id('square'),d.preset?(d.square?'正方形 → 通常':'通常 → 正方形'):fit==='stretch'&&s.width===s.height?'文字の比率を維持':'強制square化',ButtonStyle.Secondary,undefined,Boolean(d.preset&&['text4','text5'].includes(d.preset)))),
  ];
  if(s.layers.length) {
    rows.push(select(id('layer'),'編集するレイヤーを選択',s.layers.map((l,i)=>({label:`${i+1}. ${l.kind==='outline'?`縁取り · ${l.width}px`:`影 · ${l.x}, ${l.y} / ぼかし${l.blur}`} · ${l.color}`,value:String(i),default:d.selected===i}))),
      row(button(id('editlayer'),'選択した層を編集'),button(id('up'),'↑',ButtonStyle.Secondary,undefined,d.selected===0),button(id('down'),'↓',ButtonStyle.Secondary,undefined,d.selected>=s.layers.length-1),button(id('duplicate'),'複製'),button(id('delete'),'削除')));
  }
  rows.push(row(button(id('generate'),'画像を生成',ButtonStyle.Success),button(id('save'),'保存'),button(id('share'),'共有カードを投稿'),button(id('library'),'保存一覧'),button(id('hub'),'種類を選び直す')));
  rows.push(row(button(id('code'),'コードを表示'),...(d.templateId?[button(id('remove'),'このテンプレートを一覧から外す')]:[])));
  return card('カスタムテキスト',info,'info',rows,undefined,d.preview?'attachment://text-preview.png':undefined);
}
export function textLibraryCard(key:string,d:TextDraft,entries:{id:string;name:string;total:string}[]) {
  const id=(action:string)=>`txt:${key}:${action}`,rows:CardRow[]=[];
  if(entries.length)rows.push(select(id('load'),'テンプレートを選んで読み込む',entries.map(t=>({label:t.name.slice(0,100),value:t.id}))));
  rows.push(row(button(id('prev'),'前へ',ButtonStyle.Secondary,undefined,d.page===0),button(id('next'),'次へ',ButtonStyle.Secondary,undefined,(d.page+1)*20>=Number(entries[0]?.total??0)),button(id('import'),'共有コードから追加'),button(id('back'),'編集に戻る')));
  return card('保存済みテンプレート',`${entries.length?`**${d.page+1}ページ目** · 合計${entries[0]!.total}件`:'保存したテンプレートはまだありません。'}\nデザインだけを保存します。文字は読み込み後に変更できます。\n-# 共有コードから同じ設定を復元できます。表示名は自分用に設定できます。旧IDからの追加にも対応しています。`,'info',rows);
}
