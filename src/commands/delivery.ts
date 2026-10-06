import {Context} from './context.js';
import {channelAllowsCommand} from './policy.js';
export const channelDenied='このチャンネルではBot利用が**許可されていません。**\n管理者が `setchannel` で有効にできます。';
export async function authorizeChannel(name:string,ctx:Context,allowed:ReadonlySet<string>) {
  if(!allowed.has(ctx.channelId))ctx.makePrivate();
  if(channelAllowsCommand(name,ctx.channelId,allowed))return true;
  await ctx.prepare(true);await ctx.error(channelDenied);return false;
}
