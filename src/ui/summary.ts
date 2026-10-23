import {buttonLifetimeMs} from '../commands/policy.js';
import {ButtonStyle} from 'discord.js';
import {card,row,button} from './cards.js';
import {summaryMinutes,parseSummaryMinutes,type ConversationSummary} from '../services/conversation.js';
import {UserError} from '../errors.js';

export function summaryAction(customId:string,userId:string,now=Date.now()) {
  const [prefix,action,owner,range,time,...extra]=customId.split(':');
  if(owner!==userId)throw new UserError('この要約はコマンドを実行した人専用です。/imakita を実行してください。');
  if(prefix!=='summary'||extra.length||!['short','detail','range-short','range-detail'].includes(action??''))throw new UserError('要約を開き直してください。');
  const minutes=parseSummaryMinutes(range??30);
  const at=time===undefined?undefined:Number(time);
  if(at!==undefined&&(!Number.isSafeInteger(at)||at>now||at<now-buttonLifetimeMs))throw new UserError('この要約は期限切れです。もう一度 /imakita を実行してください。');
  return {minutes,detailed:action!.endsWith('detail'),at:action!.startsWith('range-')?undefined:at};
}

export function summaryCard(result:ConversationSummary,owner:string) {
  const {minutes,at,detailed}=result;
  const id=(action:string,range=minutes)=>`summary:${action}:${owner}:${range}:${at}`;
  const start=Math.floor((at-minutes*60_000)/1000),end=Math.floor(at/1000);
  const note=result.limited?'\n-# 投稿が多いため、この範囲の最新200件から要約しています。':'';
  return card(`今北産業 · 過去${minutes}分${detailed?'の詳細':''}`,`${result.text}${note}`,'info',[
    row(...summaryMinutes.map(range=>button(id(detailed?'range-detail':'range-short',range),`${range}分`,range===minutes?ButtonStyle.Success:ButtonStyle.Secondary,undefined,range===minutes)),
      button(id(detailed?'short':'detail'),detailed?'3行の要約に戻る':'さらに詳しく',ButtonStyle.Primary)),
  ],`取得時点の対象: <t:${start}:t>〜<t:${end}:t> · 会話 ${result.count}件`);
}
