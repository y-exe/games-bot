import {ButtonBuilder,ButtonStyle} from 'discord.js';
import {commandNames} from '../commands/definitions.js';
import {row} from './cards.js';

const operations:Record<string,string>={
  game:'対戦の操作',replay:'もう一度対戦',eco:'ポイントの操作',help:'使い方の表示',
  time:'時計の切替',tenki:'天気の切替',rate:'為替の切替',summary:'会話要約の切替',
  editor:'カードの編集',prompt:'入力フォーム',again:'コマンドの再実行',
  'legacy command':'チャットのコマンド',interaction:'Botの操作',
};

// Only fixed operation names leave Discord. Never copy custom IDs, arguments or exception text.
export function reportOperation(operation:string):string {
  const name=operation.replace(/^\//,'');
  if(commandNames.has(name))return name;
  const [prefix,command]=name.split(':');
  if((prefix==='again'||prefix==='prompt')&&command&&commandNames.has(command))return command;
  return prefix&&Object.hasOwn(operations,prefix)?operations[prefix]!:'不明';
}

export function bugReportUrl(operation:string,code:string|undefined,occurredAt:Date):string {
  const errorId=code&&/^[a-f0-9]{8}$/.test(code)?code:undefined;
  const url=new URL('https://github.com/y-exe/games-bot/issues/new');
  url.searchParams.set('template','bug-report.yml');
  url.searchParams.set('title',`[不具合] ${errorId??'Botの操作'}`);
  url.searchParams.set('diagnostics',[
    `操作: ${reportOperation(operation)}`,`日時: ${occurredAt.toISOString()}`,
    ...(errorId?[`エラーID: ${errorId}`]:[]),
  ].join('\n'));
  return url.toString();
}

export function bugReportRow(operation:string,code:string|undefined,occurredAt:Date) {
  return row(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('バグを報告')
    .setURL(bugReportUrl(operation,code,occurredAt)));
}
