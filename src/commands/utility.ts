import {UserError} from '../errors.js';
import { PermissionFlagsBits, UserFlags, type ButtonInteraction, MessageFlags, ButtonStyle } from 'discord.js';
import { card, row, button } from '../ui/cards.js';
import { emoji } from '../ui/emojis.js';
import { Context } from './context.js';
import {trackExpiringButtons} from '../ui/button-expiry.js';
import {request, cachedFetch, weather, type Forecast } from '../services/network.js';
import { Store } from '../data/store.js';
import { conversationSummary } from '../services/conversation.js';
import {commands,slashCommands} from './definitions.js';
import {settings} from '../config.js';
import {suddenDeath} from '../ui/sudden-death.js';
import {toggleAllowedChannel} from '../services/channels.js';
import {exchangeInput,exchangeQuote} from '../services/exchange.js';
import {rewards,othelloReward} from '../data/rewards.js';
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
  const registered=await ctx.client.application.commands.set(slashCommands.map(c=>c.toJSON()),target);
  return ctx.send(card('コマンド同期完了',`**\`${registered.size}個\`** のスラッシュコマンド（\`/help\` · \`/imakita\`）を同期しました。\n-# 他のコマンドはチャットへの直接入力で使えます。\n-# 同期先サーバー: ${target}`,'success'));
}
export function commandListCard() {
  return card('杉山啓太Bot · 全コマンド一覧',commands.map(command=>`- \`${['help','imakita'].includes(command.name)?`/${command.name}`:command.name}\` · ${command.description}`).join('\n')+'\n-# `/help` と `/imakita` だけスラッシュ対応。他はチャットへの直接入力で使い、日本語の別名にも対応しています。','info',[row(button('help:home','カテゴリに戻る',ButtonStyle.Secondary,emoji('status_info')))]);
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
export function help(category='home') {
  if(category==='all')return commandListCard();
  const content:Record<string,string>={
    home:'**遊ぶ** · オセロ / 四目並べ / じゃんけん / ハイロー\n対戦相手を募集したり、Botと練習できます。\n\n**ポイント** · ログインボーナス / ランキング / 送金 / ギャンブル\n**作る・調べる** · 文字画像 / 画像加工 / 音声 / 天気 / 時計 / 会話要約\n\n下のカテゴリから使い方を選んでください。\n-# コマンドはチャットに直接入力します。`/help` と `/imakita` だけスラッシュでも使えます。\n-# コマンドだけ入力すると、文字やファイルを入力できるフォームが開きます。',
    games:`**対戦でポイントを稼ぐ**\n- \`othello (@相手)\` · 勝利 **${othelloReward(6,0).win}〜${othelloReward(10,100).win}pt**\n-# 6マス: 120＋石差×2 / 8マス: 150＋石差×3 / 10マス: 210＋石差×5\n-# 引分30〜50pt · 敗北−30〜−45pt · 投了での勝利は90〜650pt\n- \`connectfour (@相手)\` · 勝利 **+${rewards.connectfour.win}pt** / 引分 **+${rewards.connectfour.draw}pt** / 敗北 **${rewards.connectfour.lose}pt**\n- \`janken (@相手)\` · 勝利 **+${rewards.janken.win}pt** / 引分 **+${rewards.janken.draw}pt** / 敗北 **${rewards.janken.lose}pt**\n- \`highlow 賭け金 (@相手)\` · 単独正解で賭け金の **2倍**を受取\n-# 両者正解は返金、両者不正解は没収\n- \`leave\` · 確認して対戦を終了\n\n**対戦の操作**\n盤面の数字・文字と同じボタンで石やコマを置きます。\n相手を省略すると自由募集。ハイロー以外は募集者が **Botと対戦** も選べます。\n-# オセロの指名対戦は、指名された相手のみ参加できます。\n-# 盤面の手番は3分 · じゃんけん・ハイローの選択は60秒\n-# Bot対戦は基礎値で精算（6マス: 80＋石差 / じゃんけん勝利+25 など）\n-# チャンネル停止中も leave で対戦終了を確認できます。`,
    economy:'**ポイントを使う**\n- `login` · **30〜150pt / 日**。連続日数と順位で加算\n- `point` · 自分の残高とランキング\n- `give @相手 金額` · 手数料15%で送金\n- `bet 金額` · 増減は賭け金の **−100%〜＋100%**\n- `gamble` · 賭け金・倍率を抽選。変動は賭け金の **−11倍〜＋9倍**\n-# Bet・ギャンブルは賭け金の固定上限なし。負けるとポイントが減ります。\n\n**毎日の受取**\nログインは **毎日0時（日本時間）** に切替。\n**今後のログボ** ボタンで予測を確認できます。\n-# ポイントはこのBot内のゲーム用です。',
    media:'**文字画像**\n- `text 文字` · 黄の縁取り / `text2 文字` · 青 / `text3 文字` · 赤の明朝体\n- `text4 文字 square` · 変形スタンプ / `text5 文字 square` · 虹色スタンプ\n-# text〜text3: コンマで改行 · squareで正方形スタンプ\n\n**画像加工・音声**\n- `watermark` ＋画像 · 端末テンプレートを合成\n- `gaming` ＋画像 · 七色に光るGIF\n- `5000 上 下` · 5000兆円風の画像\n- `voice 文字` · VOICEVOX読み上げ＋ボイチェン\n-# `voice` ＋添付音声でも変換（45秒・10MB以下）\n-# voiceは指定サーバーで利用できます。',
    utility:'**便利機能**\n- `/imakita` · 過去30分の会話を3行で要約\n- `tenki 地名` · 3日分の天気\n- `rate 金額 通貨` · 円換算\n- `time 国コード` · 世界時計\n- `info (@相手)` · プロフィール・バッジ\n- `totusi 文字列` · 突然の死\n- `ping` · 接続状況\n\n**管理**\n- `setchannel` · 利用チャンネルの切替（管理者）\n- `sync` · スラッシュコマンドの同期（Bot所有者・管理者）\n-# tenki・time・rate のカードはボタンで都市や通貨を切替。',
  };
  const categories=[['home','トップ','🏠'],['games','ゲーム','🎮'],['economy','ポイント','🪙'],['media','画像・音声','🎨'],['utility','便利・管理','🛠️']] as const;
  return card('杉山啓太Bot · 使い方',content[category]??content.home!,'info',[row(...categories.map(([key,label,icon])=>button(`help:${key}`,label,category===key?ButtonStyle.Primary:ButtonStyle.Secondary,icon,category===key))),row(button('help:all','コマンド一覧を表示',ButtonStyle.Primary,'📋'))]);
}
export async function utility(name:string,ctx:Context,store:Store,allowed:Set<string>) {
  if(name==='help')return ctx.send(help());
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
    const [profile,member]=await Promise.all([
      target.fetch(true).then(user=>({user,complete:true})).catch(()=>({user:target,complete:false})),
      ctx.guild!.members.fetch({user:target.id,force:true}).catch(()=>undefined),
    ]);
    const user=profile.user;
    const badgeMap:[number,string][]=[[UserFlags.Staff,'staff'],[UserFlags.Partner,'partnerserver'],[UserFlags.Hypesquad,'events'],[UserFlags.HypeSquadOnlineHouse1,'bravery'],[UserFlags.HypeSquadOnlineHouse2,'brilliance'],[UserFlags.HypeSquadOnlineHouse3,'balance'],[UserFlags.BugHunterLevel1,'bugHunter'],[UserFlags.BugHunterLevel2,'bugHunter'],[UserFlags.PremiumEarlySupporter,'earlysupporter'],[UserFlags.VerifiedDeveloper,'earlyverifiedbot'],[UserFlags.CertifiedModerator,'moderator'],[UserFlags.ActiveDeveloper,'activedeveloper']];
    const badges=badgeMap.filter(([flag])=>user.flags?.has(flag)).map(([,name])=>emoji(name));if(member?.premiumSince)badges.push(emoji('booster'));
    const nitro=!user.bot&&(user.avatar?.startsWith('a_')||Boolean(user.banner));
    if(nitro)badges.push(emoji('nitro'));
    const roleList=member?.roles.cache.filter(r=>r.id!==ctx.guild!.id).sort((a,b)=>b.position-a.position).map(r=>`<@&${r.id}>`)??[];
    const roles=roleList.join(' ');
    return ctx.send(card(`${member?.displayName??user.username} の情報`,`**ユーザー名** · ${user.username}\n**Bot?** · ${user.bot?'はい':'いいえ'}\n**ユーザーID** · \`${user.id}\`\n**アカウント作成** · <t:${Math.floor(user.createdTimestamp/1000)}:D>${member?.joinedTimestamp?`\n**サーバー参加** · <t:${Math.floor(member.joinedTimestamp/1000)}:R>`:''}${badges.length?`\n\n**バッジ** · ${[...new Set(badges)].join(' ')}`:''}${roles?`\n**ロール (${roleList.length})** · ${roles.slice(0,1000)}`:''}${nitro?'\n-# Nitroの表示はアバター・バナーからの推定です。':''}${!profile.complete||!member?'\n-# 一部のプロフィール情報を取得できませんでした。時間をおいて確認してください。':''}`,'info',[],undefined,undefined,member?.displayAvatarURL({size:256})??user.displayAvatarURL({size:256}),member?.displayColor||undefined));
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
    const summary=await conversationSummary(channel);
    return ctx.send(summaryCard(summary,ctx.user.id,false));
  }
  throw new UserError('コマンドが見つかりません。');
}
export async function handleHelp(i:ButtonInteraction){
  const payload=help(i.customId.split(':')[1]);
  if(i.message.flags.has(MessageFlags.Ephemeral)){await i.deferUpdate();await i.editReply(payload);}
  else await i.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
}
function summaryCard(summary:string,owner:string,detailed:boolean) {
  return card(detailed?'今北産業 · 時間帯別の詳細':'今北産業 · 過去30分',summary,'info',[row(button(`summary:${detailed?'short':'detail'}:${owner}`,detailed?'3行の要約に戻る':'さらに詳しく',ButtonStyle.Primary))],`DeepSeek · ${detailed?'各時間帯':'過去30分'}最大200件 · 2分間キャッシュ`);
}
export async function handleSummary(i:ButtonInteraction) {
  const [,mode,owner]=i.customId.split(':');
  if(owner!==i.user.id)throw new UserError('この要約はコマンドを実行した人専用です。/imakita を実行してください。');
  if(mode!=='short'&&mode!=='detail')throw new UserError('要約を開き直してください。');
  if(!i.inCachedGuild()||!i.channel||!('messages' in i.channel))throw new UserError('このチャンネルでは履歴を取得できません。');
  if(!i.guild.members.me?.permissionsIn(i.channelId).has(PermissionFlagsBits.ReadMessageHistory))throw new UserError('Botに「メッセージ履歴を読む」権限を付与してください。');
  await i.deferUpdate();
  await i.editReply(summaryCard(await conversationSummary(i.channel,mode==='detail'),owner,mode==='detail'));
}
