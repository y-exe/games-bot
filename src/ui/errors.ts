import {errorReport} from '../errors.js';
import {UserError} from '../errors.js';
import {card} from './cards.js';
import {MessageFlags,type Interaction} from 'discord.js';
let publicChannels:ReadonlySet<string>=new Set();
export function setErrorChannels(set:ReadonlySet<string>) {publicChannels=set;}
export function isPublicChannel(channelId:string) {return publicChannels.has(channelId);}
export function exceptionCard(error:unknown,operation:string) {
  const report=errorReport(error,operation);
  return card(report.friendly?'操作を確認してください':'処理エラー',report.body,report.friendly?'warning':'danger');
}
export async function replyWithError(i:Interaction,error:unknown) {
  const payload=exceptionCard(error,i.isChatInputCommand()?`/${i.commandName}`:'customId' in i?i.customId:'interaction');
  if(!i.isRepliable())return;
  if(i.isChatInputCommand()&&i.deferred) {
    if(i.ephemeral||error instanceof UserError)return i.editReply(payload);
    if(isPublicChannel(i.channelId))return i.editReply(payload);
    await i.editReply(card('処理エラー','**処理を完了できませんでした。**\n詳細は本人向けの返信を確認してください。','danger'));
    return i.followUp({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
  }
  if(i.deferred||i.replied)return i.followUp({...payload,flags:MessageFlags.IsComponentsV2|(isPublicChannel(i.channelId??'')?0:MessageFlags.Ephemeral)});
  return i.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
}
