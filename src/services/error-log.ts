import {MessageFlags,REST,Routes} from 'discord.js';
import {settings} from '../config.js';
let rest:REST|undefined;
function client() {
  rest??=new REST({version:'10'}).setToken(settings.token);
  return rest;
}
export function postErrorLog(payload:Record<string,unknown>) {
  if(!settings.errorLogChannelId)return;
  const body={...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.SuppressNotifications};
  void client().post(Routes.channelMessages(settings.errorLogChannelId),{body}).catch(e=>console.error(`エラーログチャンネルへの投稿に失敗: ${e instanceof Error?e.message:'unknown'}`));
}