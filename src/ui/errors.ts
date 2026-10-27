import {errorReport} from '../errors.js';
import {UserError} from '../errors.js';
import {card} from './cards.js';
import {MessageFlags,type Interaction} from 'discord.js';
import {postErrorLog} from '../services/error-log.js';
import {bugReportRow} from './bug-report.js';
let publicChannels:ReadonlySet<string>=new Set();
export function setErrorChannels(set:ReadonlySet<string>) {publicChannels=set;}
export function isPublicChannel(channelId:string) {return publicChannels.has(channelId);}
export function exceptionCards(error:unknown,operation:string,interactionInfo='') {
  const report=errorReport(error,operation);
  const occurredAt=new Date();
  const reportRows=()=>[bugReportRow(operation,report.friendly?undefined:report.id,occurredAt)];
  const unavailable=['10062','10015','50027'].includes(report.code??'');
  const diagnostic=card(unavailable?'操作の応答期限切れ':'処理エラー · 調査情報',`**エラーID** · \`${report.id}\`\n**処理** · \`${report.context}\`\n**種類** · \`${report.name}\`${report.code?`\n**エラーコード** · \`${report.code}\``:''}${report.status?`\n**HTTPステータス** · \`${report.status}\``:''}\n**発生時刻** · <t:${Math.floor(occurredAt.getTime()/1000)}:F>${interactionInfo?`\n${interactionInfo}`:''}${unavailable?report.code==='10062'?'\nDiscordが操作を期限切れ、または無効として扱ったため、応答できませんでした。':'\n返信用トークン、または返信先のWebhookが無効になったため、応答できませんでした。':''}`,unavailable?'warning':'danger',[bugReportRow(operation,report.id,occurredAt)]);
  return {response:card(report.friendly?'操作を確認してください':'処理エラー',report.body,report.friendly?'warning':'danger',reportRows()),diagnostic,unavailable};
}
export function exceptionCard(error:unknown,operation:string) {return exceptionCards(error,operation).response;}
export async function replyWithError(i:Interaction,error:unknown) {
  const info=Number.isFinite(i.createdTimestamp)?`**操作からの経過** · ${Math.max(0,Date.now()-i.createdTimestamp).toLocaleString('ja-JP')}ms\n**受付状態** · ${i.isRepliable()&&(i.deferred||i.replied)?'受付済み':'未受付'}`:'';
  const failure=exceptionCards(error,i.isChatInputCommand()?`/${i.commandName}`:'customId' in i?i.customId:'interaction',info),payload=failure.response;
  if(!(error instanceof UserError))postErrorLog(failure.diagnostic);
  if(failure.unavailable)return;
  if(!i.isRepliable())return;
  if(i.deferred&&i.ephemeral)return i.editReply(payload);
  if(i.isChatInputCommand()&&i.deferred) {
    if(i.ephemeral||error instanceof UserError)return i.editReply(payload);
    if(isPublicChannel(i.channelId))return i.editReply(payload);
    await i.editReply(card('処理エラー','**処理を完了できませんでした。**\n詳細は本人向けの返信を確認してください。','danger'));
    return i.followUp({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
  }
  if(i.deferred||i.replied)return i.followUp({...payload,flags:MessageFlags.IsComponentsV2|(isPublicChannel(i.channelId??'')?0:MessageFlags.Ephemeral)});
  return i.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
}
