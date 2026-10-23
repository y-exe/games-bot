import {help} from './help.js';
import {UserError} from '../errors.js';
import { PermissionFlagsBits, type ButtonInteraction, MessageFlags, ButtonStyle,ButtonBuilder } from 'discord.js';
import { card, row, button } from '../ui/cards.js';
import { emoji } from '../ui/emojis.js';
import {publicBadgeNames,accountAgeBadge,serverBoostBadge} from '../ui/badges.js';
import {profileCard} from '../ui/profile.js';
import {formatAmount} from '../data/money.js';
import { Context } from './context.js';
import {trackExpiringButtons} from '../ui/button-expiry.js';
import {request, cachedFetch, weather, type Forecast } from '../services/network.js';
import { Store } from '../data/store.js';
import { conversationSummary,parseSummaryMinutes } from '../services/conversation.js';
import {summaryCard,summaryAction} from '../ui/summary.js';
import {commandSyncApi,syncSlashCommands} from '../services/command-sync.js';
import {settings} from '../config.js';
import {suddenDeath} from '../ui/sudden-death.js';
import {toggleAllowedChannel} from '../services/channels.js';
import {exchangeInput,exchangeQuote} from '../services/exchange.js';
export async function syncCommands(ctx:Context) {
  const owner=ctx.user.id===settings.ownerId;
  if(!owner&&!ctx.admin)throw new UserError('コマンド同期はBot所有者またはサーバー管理者のみ実行できます。');
  const target=ctx.text('guild_id',0,ctx.guild!.id);
  if(!/^\d{17,20}$/.test(target))throw new UserError('同期先は有効なサーバーIDを指定してください。');
  if(!settings.production&&target!==settings.guildId)throw new UserError('テストBotは指定のテストサーバーだけに同期できます。');
  if(target!==ctx.guild!.id&&!owner) {
    const guild=await ctx.client.guilds.fetch(target);
    const member=await guild.members.fetch(ctx.user.id);
    if(!member.permissions.has(PermissionFlagsBits.Administrator))throw new UserError('同期先サーバーの管理者権限が必要です。');
  }
  if(!ctx.client.application)throw new UserError('Botの接続準備ができていません。');
  const result=await syncSlashCommands(commandSyncApi(ctx.client.rest,ctx.client.application.id),settings.applicationId,target,!settings.production);
  return ctx.send(card('コマンド同期完了',`**${result.count}個** のスラッシュコマンド（\`/help\` · \`/imakita\`）を確認しました。${result.changed?'登録内容を更新しました。':'変更はありません。'}\n-# 他のコマンドはチャットへの直接入力で使えます。\n-# 同期先サーバー: ${target}`,'success'));
}
export const timezones:Record<string,string>={JP:'Asia/Tokyo',US:'America/New_York',GB:'Europe/London',UK:'Europe/London',CN:'Asia/Shanghai',KR:'Asia/Seoul',TW:'Asia/Taipei',AU:'Australia/Sydney',DE:'Europe/Berlin',FR:'Europe/Paris',RU:'Europe/Moscow',BR:'America/Sao_Paulo',IN:'Asia/Kolkata',CA:'America/Toronto',SG:'Asia/Singapore'};
export function timeHelpCard() {
  return card('Timeコマンド · 国コード一覧',`**国・地域コード → 都市**\n${Object.entries(timezones).sort(([a],[b])=>a.localeCompare(b)).map(([code,tz])=>`- \`${code}\` · ${tz.split('/').at(-1)!.replaceAll('_',' ')}`).join('\n')}\n-# 例: time US`);
}
export function timeCard(code:string) {
  const tz=timezones[code];
  if(!tz)return undefined;
  const now=new Date();const offset=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'longOffset'}).formatToParts(now).find(p=>p.type==='timeZoneName')?.value.replace('GMT','UTC');
  const quick=(['JP','US','GB','KR'] as const).filter(candidate=>candidate!==code);
  return card(`${tz.split('/')[1]!.replaceAll('_',' ')} の現在時刻`,`> **${new Intl.DateTimeFormat('ja-JP',{timeZone:tz,dateStyle:'full',timeStyle:'medium'}).format(now)}**\n-# ${offset} · 切替例: time US`,'info',[row(...quick.map(candidate=>button(`time:${candidate}`,candidate,ButtonStyle.Secondary)),button('time:help','国コード一覧',ButtonStyle.Secondary,emoji('status_info')))]);
}
export async function handleTimeSwitch(i:ButtonInteraction) {
  const code=(i.customId.split(':')[1]??'').toUpperCase();
  const payload=timeCard(code)??card('無効な国コード',`\`${code}\` は見つかりませんでした。`,'warning',[row(button('time:help','国コード一覧を表示',ButtonStyle.Secondary,emoji('status_info')))]);
  await i.deferUpdate();trackExpiringButtons(await i.editReply(payload));
}
export async function handleTimeHelp(i:ButtonInteraction) {
  await i.reply({...timeHelpCard(),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
}
const telopEmoji=(telop:string)=>telop.includes('雪')?'❄️':telop.includes('雷')?'⛈️':telop.includes('雨')?'🌧️':telop.includes('曇')?'☁️':telop.includes('晴')?'☀️':'';
const quickCities=['東京','大阪','札幌','福岡','那覇'];
export function weatherCard(data:Forecast) {
  const updated=new Date(data.publicTime);
  const time=Number.isFinite(updated.getTime())?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'}).format(updated)+' JST':'不明';
  const cities=quickCities.filter(city=>city!==data.location.city);
  return card(`${data.location.city} の天気予報`,data.forecasts.slice(0,3).map(f=>`**${f.dateLabel} · ${f.date}**\n${telopEmoji(f.telop)} ${f.telop} · 最高 **${f.temperature.max?.celsius??'--'}°C** / 最低 **${f.temperature.min?.celsius??'--'}°C**`).join('\n\n')+`\n-# 予報更新: ${time}`,'success',[row(...cities.slice(0,4).map(city=>button(`tenki:${city}`,city,ButtonStyle.Secondary)))],'つくもAPI · 最大10分キャッシュ',undefined,undefined,0x3498db);
}
export async function handleTenkiSwitch(i:ButtonInteraction) {
  const city=i.customId.split(':')[1]??'';
  await i.deferUpdate();trackExpiringButtons(await i.editReply(weatherCard(await weather(city))));
}
export async function rateCard(amountInput:string|number,codeInput:string) {
  const {amount,code}=exchangeInput(amountInput,codeInput);
  const rates=await cachedFetch<unknown>('rates',300_000,async()=> (await request('https://exchange-rate-api.krnk.org/api/rate')).json());
  const quote=exchangeQuote(amount,code,rates),rate=quote.rate;
  const updated=new Date(quote.updated);
  const updatedText=Number.isFinite(updated.getTime())?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'}).format(updated)+' JST':'不明';
  const quick=(['USD','EUR','CNY','KRW'] as const).filter(candidate=>candidate!==code);
  return card('為替レート変換',`> **${amount.toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})} ${code} → ${quote.yen.toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})} 円**\n**使用レート** · 1 ${code} = \`${rate}円\`\n-# レート更新: ${updatedText} · 最大5分間キャッシュ`,'success',quick.length?[row(...quick.map(candidate=>button(`rate:${amountInput}:${candidate}`,candidate,ButtonStyle.Secondary)))]:[],'Exchange Rate API',undefined,undefined,0xf1c40f);
}
export async function handleRateSwitch(i:ButtonInteraction) {
  const [,amount,code]=i.customId.split(':');
  await i.deferUpdate();trackExpiringButtons(await i.editReply(await rateCard(amount??'',code??'')));
}
export async function utility(name:string,ctx:Context,store:Store,allowed:Set<string>) {
  if(name==='help')return ctx.send(help('home',ctx.user.id));
  if(name==='sync')return syncCommands(ctx);
  if(name==='setchannel') {
    if(!ctx.admin)throw new UserError('この設定はサーバー管理者のみ変更できます。');
    const enabled=await toggleAllowedChannel(store,ctx.channelId,allowed);
    return ctx.send(card('設定変更完了',`<#${ctx.channelId}> でのコマンド利用を **${enabled?'許可':'停止'}** しました。`,'success'));
  }
  if(name==='ping')return ctx.send(card('pong',`**応答速度** · **${Math.round(ctx.client.ws.ping)}ms**\n**稼働時間** · ${Math.floor(process.uptime()/60)}分\n**メモリ使用量** · ${Math.round(process.memoryUsage().rss/1024/1024)}MB`,'success'));
  if(name==='time') {
    const code=ctx.text('country',0,'JP').toUpperCase();const tz=timezones[code];
    if(!tz)return ctx.send(card('無効な国コード',`\`${code}\` は見つかりませんでした。\n下のボタンで使える国・地域コードを確認できます。`,'warning',[row(button('time:help','国コード一覧を表示',ButtonStyle.Secondary,emoji('status_info')))]));
    return ctx.send(timeCard(code)!);
  }
  if(name==='info') {
    const target=await ctx.target('user')??ctx.user;
    const [profile,member,account]=await Promise.all([
      target.fetch(true).then(user=>({user,complete:true})).catch(()=>({user:target,complete:false})),
      ctx.guild!.members.fetch({user:target.id,force:true}).catch(()=>undefined),
      store?.account(target.id).catch(()=>undefined),
    ]);
    const user=profile.user;
    const badges=publicBadgeNames(user.flags).map(name=>emoji(name));
    const now=new Date(),age=accountAgeBadge(user.createdTimestamp,now),boost=!user.bot?serverBoostBadge(member?.premiumSince,now):undefined;
    const ageDisplay=age?`${!user.bot&&age.name?`${emoji(age.name)} `:''}**${age.text}**`:undefined;
    const boostDisplay=boost?`${emoji(boost.name)} **${boost.text}**`:undefined;
    const nitro=!user.bot&&(user.avatar?.startsWith('a_')||Boolean(user.banner));
    const roleList=member?.roles.cache.filter(r=>r.id!==ctx.guild!.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`)??[];
    const members=ctx.guild!.members.cache;
    const completeMembers=members&&members.size===ctx.guild!.memberCount&&members.every(m=>m.joinedTimestamp!==null);
    const joinedOrder=completeMembers?[...members.values()].sort((a,b)=>a.joinedTimestamp!-b.joinedTimestamp!||(BigInt(a.id)<BigInt(b.id)?-1:a.id===b.id?0:1)).findIndex(m=>m.id===user.id)+1:0;
    const rank=account&&ctx.client?.user?await store.rank(user.id,ctx.client.user.id).catch(()=>undefined):undefined;
    const summary=[
      `**ユーザー名** · \`${user.username.replaceAll('`','´')}\` · ${user.bot?'アプリ':'ユーザー'}`,
      `**ID** · \`${user.id}\``,
      ...(badges.length?[`**公開バッジ** · ${[...new Set(badges)].join(' ')}`]:[]),
    ].join('\n');
    const sections=[[
      `**アカウント作成** · <t:${Math.floor(user.createdTimestamp/1000)}:D>${ageDisplay?` · ${ageDisplay}`:''}`,
      ...(user.globalName&&user.globalName!==user.username?[`**表示名** · ${user.globalName}`]:[]),
      ...(nitro?[`**Nitro（推定）** · ${emoji('b_nitro')}`]:[]),
    ].join('\n'),[
      ...(member?.joinedTimestamp?[`**サーバー参加** · <t:${Math.floor(member.joinedTimestamp/1000)}:D> · <t:${Math.floor(member.joinedTimestamp/1000)}:R>`]:[]),
      ...(joinedOrder>0?[`**参加順** · **${joinedOrder.toLocaleString()} / ${ctx.guild!.memberCount.toLocaleString()}人**`]:[]),
      ...(boostDisplay?[`**ブースト継続** · ${boostDisplay}（このサーバー）`]:[]),
      ...(roleList.length?[`**ロール (${roleList.length})** · ${roleList.slice(0,15).join(' ')}${roleList.length>15?` ほか${roleList.length-15}件`:''}`]:[]),
    ].join('\n'),account?[
      `**Bot内ポイント** · **${formatAmount(account.points)}pt**${rank?` · ${rank.toLocaleString()}位`:''}`,
      `**連続ログイン** · ${account.consecutive}日${account.lastLogin?` · 最終 ${account.lastLogin}`:''}`,
    ].join('\n'):''].filter(Boolean);
    if(!profile.complete||!member)sections.push('-# 一部のプロフィール情報を取得できませんでした。時間をおいて確認してください。');
    const links=[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('アバターを見る').setURL(member?.displayAvatarURL({size:1024})??user.displayAvatarURL({size:1024}))];
    const banner=user.bannerURL?.({size:1024});if(banner)links.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('バナーを見る').setURL(banner));
    return ctx.send(profileCard(`${member?.displayName??user.globalName??user.username} の情報`,summary,sections.join('\n\n'),member?.displayAvatarURL({size:256})??user.displayAvatarURL({size:256}),[row(...links)],member?.displayColor||undefined));
  }
  if(name==='totusi') {
    return ctx.send(card('突然の死',suddenDeath(ctx.slash?.options.getString('text')??ctx.args.join(' ')),'success',[],undefined,undefined,undefined,0x95a5a6));
  }
  if(name==='rate')return ctx.send(await rateCard(ctx.slash?.options.getNumber('amount')??ctx.args[0]??'',ctx.text('currency',1)));
  if(name==='tenki') {
    const data=await weather(ctx.slash?.options.getString('city')??ctx.args.join(' '));
    return ctx.send(weatherCard(data));
  }
  if(name==='imakita') {
    const channel=ctx.channel;if(!channel||!('messages' in channel))throw new UserError('このチャンネルでは履歴を取得できません。');
    if(!ctx.guild?.members.me?.permissionsIn(ctx.channelId).has(PermissionFlagsBits.ReadMessageHistory))throw new UserError('Botに「メッセージ履歴を読む」権限を付与してください。');
    const minutes=parseSummaryMinutes(ctx.slash?.options.getInteger('minutes')??ctx.args[0]??30);
    const summary=await conversationSummary(channel,false,minutes);
    return ctx.send(summaryCard(summary,ctx.user.id));
  }
  throw new UserError('コマンドが見つかりません。');
}
const summaryUpdates=new Set<string>();
export async function handleSummary(i:ButtonInteraction) {
  const action=summaryAction(i.customId,i.user.id);
  if(!i.inCachedGuild()||!i.channel||!('messages' in i.channel))throw new UserError('このチャンネルでは履歴を取得できません。');
  if(!i.guild.members.me?.permissionsIn(i.channelId).has(PermissionFlagsBits.ReadMessageHistory))throw new UserError('Botに「メッセージ履歴を読む」権限を付与してください。');
  if(summaryUpdates.has(i.message.id))throw new UserError('この要約を更新中です。表示が変わるまで少しお待ちください。');
  summaryUpdates.add(i.message.id);
  try {
    await i.deferUpdate();
    await i.editReply(summaryCard(await conversationSummary(i.channel,action.detailed,action.minutes,action.at),i.user.id));
  } finally {summaryUpdates.delete(i.message.id);}
}
