import {buttonLifetimeMs} from '../commands/policy.js';
import {ButtonStyle,LabelBuilder,ModalBuilder,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle} from 'discord.js';
import {card,row,button} from './cards.js';
import {summaryMinutes,parseSummaryMinutes,type ConversationSummary} from '../services/conversation.js';
import {UserError} from '../errors.js';

export function summaryAction(customId:string,userId:string,now=Date.now()) {
  const [prefix,action,owner,range,time,...extra]=customId.split(':');
  if(owner!==userId)throw new UserError('この要約はコマンドを実行した人専用です。/imakita を実行してください。');
  if(prefix!=='summary'||extra.length||!['short','detail','range-short','range-detail','ask'].includes(action??''))throw new UserError('要約を開き直してください。');
  const minutes=parseSummaryMinutes(range??30);
  const at=time===undefined?undefined:Number(time);
  if(at!==undefined&&(!Number.isSafeInteger(at)||at>now||at<now-buttonLifetimeMs))throw new UserError('この要約は期限切れです。もう一度 /imakita を実行してください。');
  return {minutes,detailed:action!.endsWith('detail'),ask:action==='ask',at:action!.startsWith('range-')?undefined:at};
}

export function summaryAskModal(owner:string,minutes:number,at:number) {
  const range=new StringSelectMenuBuilder().setCustomId('range').addOptions(...summaryMinutes.map(option=>({label:`過去${option}分の会話`,value:String(option),default:option===minutes})));
  const topic=new TextInputBuilder().setCustomId('topic').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200).setPlaceholder('要約に出てきた話題について質問 (例: ○○って何の話？)');
  return new ModalBuilder().setCustomId(`summary:ask:${owner}:${minutes}:${at}`).setTitle('今北産業 · 話題について質問')
    .addComponents(new LabelBuilder().setLabel('質問する範囲').setStringSelectMenuComponent(range),
      new LabelBuilder().setLabel('質問').setTextInputComponent(topic));
}

export function summaryAnswerCard(question:string,answer:string,owner:string,minutes:number,at:number) {
  const start=Math.floor((at-minutes*60_000)/1000),end=Math.floor(at/1000);
  return card('今北産業 · 質問に回答',`> ${question.replace(/\n/g,'\n> ')}\n\n${answer}`,'info',[
    row(button(`summary:ask:${owner}:${minutes}:${at}`,'さらに質問する',ButtonStyle.Primary)),
  ],`この回答は質問した人にだけ表示されます · 取得時点の対象: <t:${start}:t>〜<t:${end}:t>`);
}

export function summaryCard(result:ConversationSummary,owner:string) {
  const {minutes,at,detailed}=result;
  const id=(action:string,range=minutes)=>`summary:${action}:${owner}:${range}:${at}`;
  const start=Math.floor((at-minutes*60_000)/1000),end=Math.floor(at/1000);
  const note=result.limited?'\n-# 投稿が多いため、この範囲の最新200件から要約しています。':'';
  return card(`今北産業 · 過去${minutes}分${detailed?'の詳細':''}`,`${result.text}${note}`,'info',[
    row(...summaryMinutes.map(range=>button(id(detailed?'range-detail':'range-short',range),`${range}分`,range===minutes?ButtonStyle.Success:ButtonStyle.Secondary,undefined,range===minutes)),
      button(id(detailed?'short':'detail'),detailed?'3行の要約に戻る':'さらに詳しく',ButtonStyle.Primary),
      button(id('ask'),'話題について質問',ButtonStyle.Danger)),
  ],`取得時点の対象: <t:${start}:t>〜<t:${end}:t> · 会話 ${result.count}件`);
}
