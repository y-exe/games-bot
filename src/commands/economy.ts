import {buttonLifetimeMs} from './policy.js';
import {trackInteractionButtons} from '../ui/button-expiry.js';
import {UserError} from '../errors.js';
import { randomInt, randomUUID } from 'node:crypto';
import { ButtonStyle, MessageFlags, type ButtonInteraction, type Guild, type Message } from 'discord.js';
import { Store } from '../data/store.js';
import { jstDate } from '../data/store.js';
import { card, button, row } from '../ui/cards.js';
import { Context, positiveAmount } from './context.js';
import { emoji } from '../ui/emojis.js';
import {loginForecast,loginDay,loginReward,loginMilestoneBonus,nextLoginTime} from '../data/login.js';
import {rollGamble,diceDelta,stakeBounds} from '../data/gamble.js';
import {transferFee,formatAmount} from '../data/money.js';
import {exceptionCards,isPublicChannel} from '../ui/errors.js';
import {postErrorLog} from '../services/error-log.js';
import {requireButtonOwner} from './button-owner.js';
import {rankingExportResponse} from '../ui/rankings.js';
import {resolveRankingUsers} from '../services/ranking-users.js';
import {settings} from '../config.js';
import {dailyWealthTax} from '../data/wealth-tax.js';
import {bankruptcyBanDays,bankruptcyBanUntil,bankruptcyCooldown,bankruptcyNextDate} from '../data/bankruptcy.js';
interface Confirm { owner:string; target?:string; amount?:bigint; kind:'give'|'gamble'|'bankrupt'; expires:number; channelId:string;message?:Message }
function loginCard(result:Awaited<ReturnType<Store['login']>>,owner:string,now=new Date()) {
  const next=Math.floor(nextLoginTime(now).getTime()/1000);
  const milestone=loginMilestoneBonus(result.days);
  const body=[
    result.received?`**\`+${formatAmount(result.points)}pt\`** を獲得 · __**連続${result.days}日目**__`:'今日のボーナスは受け取り済みです。',
    `**現在のポイント** · \`${formatAmount(result.balance)}pt\``,
    ...(result.received&&result.welfare?[`**生活保護** · **\`+${formatAmount(result.welfare)}pt\`** 込み(借金の10% · 上限1,000pt)`]:[]),
    `**現在のサーバー内順位** · \`${result.rank>0?`${result.rank}位`:'圏外'}\``,
    ...(milestone?[`**連続ログイン特典** · 上の報酬に **+${formatAmount(milestone)}pt** 込み`]:[]),
    '**翌日0時の徴収** · **免除**',
    `**次回の受取** · <t:${next}:F> · <t:${next}:R>`,
    '-# 連続ログイン・サーバー内のランキング順位でボーナスが増えます。',
    '-# 借金中は受取時に借金の10%(上限1,000pt)の生活保護が上乗せされます。',
    '-# 受取は1日1回 · 日本時間0時に切替 · 5日目+50pt / 10日目+100pt · 10日目の次は1日目',
  ].join('\n');
  return card(result.received?'ログインボーナス':'ログイン済み',body,result.received?'success':'warning',[row(button(`eco:future:${owner}`,'今後のログボ',ButtonStyle.Secondary,emoji('status_info')))],undefined,undefined,undefined,result.received?0xf1c40f:0xe67e22);
}
export function loginForecastCard(account:{lastLogin:string|null;consecutive:number;points?:bigint}|undefined,rank:number,owner:string,now=new Date()) {
  const last=account?.lastLogin??null,consecutive=account?.consecutive??0;
  const pending=last!==jstDate(now),days=loginDay(last,consecutive,now);
  const next=Math.floor(nextLoginTime(now).getTime()/1000);
  const upcoming=loginForecast(last,consecutive,rank,now);
  const today=pending?`**今日の未受取** · **\`+${formatAmount(loginReward(days,rank))}pt\`**（${days}日目）\n-# 下のボタンで今日の分を受け取れます。`:`**次回の受取** · <t:${next}:F> · <t:${next}:R>`;
  const exemption=`**翌日0時の徴収** · ${pending?'今日の受取で免除':'**免除**'}`;
  const welfare=account?.points!==undefined&&account.points<0n?'\n-# 借金中は毎日の受取に生活保護(借金の10% · 上限1,000pt)が上乗せされます。':'';
  return card('今後のログインボーナス',`**現在のサーバー内順位** · \`${rank>0?`${rank}位`:'圏外'}\`\n${today}\n${exemption}\n\n**今後7日間の報酬**\n${upcoming.map(d=>`> **${d.offset===1?'明日':`${d.offset}日後`}**（${d.date.slice(5)} / ${d.days}日目） · **\`+${formatAmount(d.points)}pt\`**`).join('\n')}\n-# 今日から毎日受け取り、現在の順位が続く場合の予測です。\n-# 順位の変動や受取忘れで報酬は変わります。${welfare}`,'info',pending?[row(button(`eco:login:${owner}`,'今日のログボを受け取る',ButtonStyle.Success,emoji('status_success')))]:[],undefined,undefined,undefined,0x1abc9c);
}
export class Economy {
  private repeats=new Map<string,{owner:string;amount:string;channelId:string;expires:number}>();
  private confirms=new Map<string,Confirm>();
  private details=new Map<string,{channelId:string;expires:number;body:string}>();
  private timer:NodeJS.Timeout;
  constructor(private store: Store,private botId:()=>string) {
    this.timer=setInterval(()=>void this.expire().catch(()=>console.error('ポイント確認の期限処理に失敗しました。')),5_000);
    this.timer.unref();
  }
  async expire(now=Date.now()) {
    for(const [key,data] of this.repeats)if(data.expires<=now)this.repeats.delete(key);
    const expired=[...this.confirms].filter(([,v])=>v.expires<=now);
    for(const [key,data] of expired) {
      this.confirms.delete(key);
      if(data.message)await data.message.edit(card('確認の時間切れ',`${data.kind==='give'?'送金':data.kind==='bankrupt'?'破産':'ギャンブル'}は実行されませんでした。\n-# ポイントは変動していません。コマンドから確認を開き直してください。`,'warning')).catch(()=>{});
    }
    for(const [key,data] of this.details)if(data.expires<=now)this.details.delete(key);
  }
  close() {clearInterval(this.timer);}
  private async gamblingBan(ctx:Context) {
    const last=await this.store.bankruptcyLast(ctx.user.id);
    if(!last)return;
    const until=bankruptcyBanUntil(last.lastDate,last.banDays);
    if(jstDate()<until)throw new UserError(`破産したため${last.banDays}日間はギャンブル・betを利用できません(${until}まで)。`);
  }
  private async cohort(guild:Guild|null|undefined) {
    if(!guild)return undefined;
    try { return [...(await guild.members.fetch()).keys()]; } catch { return undefined; }
  }
  repeatAction(i:Pick<ButtonInteraction,'customId'|'user'|'channelId'>) {
    const [prefix,kind,key,...extra]=i.customId.split(':');
    if(prefix!=='again'||extra.length)throw new UserError('この操作は期限切れです。コマンドを開き直してください。');
    if(kind==='gamble') {
      requireButtonOwner(key,i.user.id);
      return {kind,args:[]} as const;
    }
    if(kind!=='bet')throw new UserError('この操作は期限切れです。コマンドを開き直してください。');
    const repeat=this.repeats.get(key??'');
    if(!repeat||repeat.expires<=Date.now()||repeat.channelId!==i.channelId)throw new UserError('このボタンは期限切れです。自分で `bet` を実行してください。');
    requireButtonOwner(repeat.owner,i.user.id);
    return {kind,args:[repeat.amount]} as const;
  }
  async repeat(i:ButtonInteraction,takeCooldown:(kind:string)=>void) {
    const repeat=this.repeatAction(i);
    takeCooldown(repeat.kind);
    const ctx=new Context(i,i.client,[...repeat.args]);
    await ctx.prepare();
    return this.run(repeat.kind,ctx);
  }
  async run(name:string,ctx:Context) {
    if(name==='point') {
      const cohort=await this.cohort(ctx.guild);
      const points=await this.store.balance(ctx.user.id);const worldRank=await this.store.rank(ctx.user.id,this.botId());const rank=cohort?await this.store.rank(ctx.user.id,this.botId(),cohort):worldRank;const poor=cohort?await this.store.poorRanking(this.botId(),cohort):await this.store.poorRanking(this.botId());const poorRank=points<0n?(cohort?await this.store.poorRank(ctx.user.id,this.botId(),cohort):await this.store.poorRank(ctx.user.id,this.botId())):-1;
      const account=await this.store.account(ctx.user.id);const gambleCount=account?.gambleDate===jstDate()?account.gambleCount:0;
      const tax=dailyWealthTax(points);
      const taxLine=account?.lastLogin===jstDate()?'**翌日0時の徴収** · **免除（ログボ受取済み）**':tax>0n?`**翌日0時の徴収目安** · **${formatAmount(tax)}pt**\n-# 今日のログボ受取で免除されます。`:'**翌日0時の徴収** · **対象外（1万pt未満）**';
      const gambleLine=points>0n?`**今日のギャンブル** · **${Math.max(0,5-gambleCount)} / 5回**`:'**今日のギャンブル** · **無制限（救済措置）**';
      const ranks=cohort?await this.store.ranking(this.botId(),10,cohort):await this.store.ranking(this.botId());
      const rankLine=cohort?`**サーバー内順位** · **${rank>0?`${rank}位`:'圏外'}** · **グローバル順位** · **${worldRank>0?`${worldRank}位`:'圏外'}**`:`**グローバル順位** · **${worldRank>0?`${worldRank}位`:'圏外'}**`;
      const list=(entries:typeof ranks,medals=false)=>entries.map((p,i)=>`${medals&&i<3?['🥇 ','🥈 ','🥉 '][i]:''}**${i+1}位** <@${p.user_id}> · **${formatAmount(p.points)}pt**`).join('\n');
      const rankButtons=[];
      if(!ctx.guild||!settings.globalRankHiddenGuildIds.has(ctx.guild.id))rankButtons.push(button(`eco:world:${ctx.user.id}`,'グローバル Top10',ButtonStyle.Secondary,'🌍'));
      rankButtons.push(button(`eco:point:${ctx.user.id}`,'サーバー Top10',ButtonStyle.Secondary,'🏆'),button(`eco:poor:${ctx.user.id}`,'貧乏 Top10',ButtonStyle.Secondary,'💸'),button(`eco:rankings:${ctx.user.id}`,'さらに表示（txt）',ButtonStyle.Secondary));
      return ctx.send(card('ゲームポイントランキング',`**あなたのポイント** · **${formatAmount(points)}pt**\n${rankLine}${poorRank>0?` · 貧乏ランク **${poorRank}位**`:''}\n${gambleLine}\n${taxLine}\n\n**🏆 ${cohort?'サーバー内ランキング':'グローバルランキング'} · Top 5**\n${list(ranks.slice(0,5),true)||'まだプレイヤーがいません。'}${poor.length?`\n\n**💸 貧乏ランキング · Top 3**\n${list(poor.slice(0,3))}`:''}`,'success',[row(...rankButtons)], undefined,undefined,undefined,0xf1c40f));
    }
    if(name==='login') {
      const now=new Date();const result=await this.store.login(ctx.user.id,this.botId(),now,await this.cohort(ctx.guild));
      return ctx.send(loginCard(result,ctx.user.id,now));
    }
    if(name==='bet') {
      await this.gamblingBan(ctx);
      const amount=positiveAmount(ctx.text('amount'));const dice=randomInt(1,7);
      const delta=diceDelta(amount,dice);
      const balance=await this.store.accounts([ctx.user.id],async(a,c)=>{
        if(!await this.store.once(c,`bet:${ctx.id}`))throw new UserError('すでに処理済みです。');
        const account=a.get(ctx.user.id)!;if(account.points<amount)throw new UserError(`残高不足です。現在 ${account.points}pt あります。`);
        account.points+=delta;return account.points;
      });
      const repeatKey=randomUUID();
      this.repeats.set(repeatKey,{owner:ctx.user.id,amount:String(amount),channelId:ctx.channelId,expires:Date.now()+buttonLifetimeMs});
      return ctx.send(card('ダイスベット結果',`${emoji(`b_${dice}`)} **${['大凶','凶','小吉','吉','中吉','大吉'][dice-1]}**\n${['賭け金を失いました。','賭け金の半分を失いました。','賭け金の半分を失いました。','ポイントは変わりません。','賭け金の半分を獲得。','賭け金と同額を獲得！'][dice-1]}\n<@${ctx.user.id}> · ベット **${formatAmount(amount)}pt**\n\n**ポイント変動** · **${delta>=0n?'+':''}${formatAmount(delta)}pt**\n**現在のポイント** · **${formatAmount(balance)}pt**`,delta>=0n?'success':'warning',[row(button(`again:bet:${repeatKey}`,'もう一度bet',ButtonStyle.Primary,emoji(`b_${dice}`)),button(`eco:point:${ctx.user.id}`,'残高・順位を見る',ButtonStyle.Secondary,emoji('status_info')))],undefined,undefined,undefined,0x9b59b6));
    }
    const key=randomUUID();const data: Confirm={owner:ctx.user.id,kind:name as 'give'|'gamble'|'bankrupt',expires:Date.now()+60_000,channelId:ctx.channelId};
    let body='';
    if(name==='give') {
      const target=await ctx.target('user');if(!target||target.bot||target.id===ctx.user.id)throw new UserError('自分以外のユーザーを送金先に指定してください。');
      data.target=target.id;data.amount=positiveAmount(ctx.text('amount',1));
      const fee=transferFee(data.amount);const balance=await this.store.balance(ctx.user.id);
      if(balance<data.amount+fee)throw new UserError(`残高不足です。手数料込みで ${data.amount+fee}pt 必要です。`);
      body=`**送金先** · <@${target.id}>\n**送金額** · **${formatAmount(data.amount)}pt**\n**手数料（15%）** · **${formatAmount(fee)}pt**\n\n**合計支払額** · **${formatAmount(data.amount+fee)}pt**\n**送金後のポイント** · **${formatAmount(balance-data.amount-fee)}pt**\n-# 内容を確認して「送金する」を押してください。`;
    } else if(name==='gamble') {
      await this.gamblingBan(ctx);
      const account=await this.store.account(ctx.user.id);const balance=account?.points??0n;
      const count=account?.gambleDate===jstDate()?account.gambleCount:0;
      if(balance>0n&&count>=5)throw new UserError('今日は5回プレイ済みです。betで遊べます。');
      const {min,max}=stakeBounds(balance),stakeRange=min===max?`${formatAmount(min)}pt`:`${formatAmount(min)}〜${formatAmount(max)}pt`;
      body=`**現在のポイント** · \`${formatAmount(balance)}pt\`\n**賭け金の範囲** · **${stakeRange}**\n**本日の残り** · ${balance>0n?`**${5-count} / 5回**`:'**無制限（救済措置）**'}\n\n**ギャンブルの仕組み**\n- 賭け金・倍率はランダム。\n- 倍率は **±1.51〜10.00倍**(当たり約71%)。\n- プラス残高は **1日5回**、借金中は **回数無制限**。\n-# ポイント変動 = 賭け金 × 倍率 − 賭け金`;
    } else {
      const balance=await this.store.balance(ctx.user.id);
      if(balance>=0n)throw new UserError('借金していないので破産できません。');
      const last=await this.store.bankruptcyLast(ctx.user.id);
      if(last){
        const next=bankruptcyNextDate(last.lastDate,last.cooldownDays);
        if(jstDate()<next)throw new UserError(`前回の破産から${last.cooldownDays}日間は再破産できません。${next}以降に実行してください。`);
      }
      const banDays=bankruptcyBanDays(-balance),cooldownDays=bankruptcyCooldown(-balance);
      body=`**現在のポイント** · \`${formatAmount(balance)}pt\`\n\n**破産すると**\n- 借金 **${formatAmount(-balance)}pt** が **0pt** に戻ります\n- 連続ログイン日数が **リセット** されます\n- **${banDays}日間**、ギャンブル・bet が使えなくなります(借金の額に応じて5〜100日)\n- **${cooldownDays}日間**、再び破産できません(借金の額に応じて30〜100日)\n-# 破産は取り消せません。「破産する」を押してください。`;
    }
    await this.expire();
    for(const [k,v] of this.details)if(v.expires<Date.now())this.details.delete(k);
    this.confirms.set(key,data);
    const message=await ctx.send(card(name==='give'?'送金を確認':name==='bankrupt'?'自己破産の確認':'ハイリスクギャンブル',body,'warning',[row(button(`eco:confirm:${key}`,name==='give'?'送金する':name==='bankrupt'?'破産する':'実行する',ButtonStyle.Danger),button(`eco:cancel:${key}`,'キャンセル',ButtonStyle.Secondary),...(name==='gamble'?[button(`eco:mechanism:${key}`,'仕組み',ButtonStyle.Secondary,'⚙️')]:[]))], '確認は60秒以内'));
    data.message=message;return message;
  }
  private async edit(i:ButtonInteraction,payload:ReturnType<typeof card>,update=false) {
    const message=await (update&&!i.message.flags.has(MessageFlags.Ephemeral)?i.message.edit(payload):i.editReply(payload));
    if(message)trackInteractionButtons(i,message);
    return message;
  }
  async handle(i:ButtonInteraction) {
    const [,action,key]=i.customId.split(':');
    if(action==='point'||action==='world'||action==='poor'||action==='rankings') {
      requireButtonOwner(key,i.user.id);
      if(action==='world'&&i.guild&&settings.globalRankHiddenGuildIds.has(i.guild.id))throw new UserError('グローバルランキングはこのサーバーでは表示できません。');
      if(i.customId.split(':').length!==3)throw new UserError('pointを実行して一覧を開き直してください。');
      await i.deferReply({flags:MessageFlags.Ephemeral});
      if(action==='rankings') {
        const ranks=await this.store.rankingExport(this.botId());
        const users=await resolveRankingUsers(ranks.map(entry=>entry.user_id),i.client,i.guild,this.store);
        const {summary,attachments}=rankingExportResponse(ranks,id=>users.get(id));
        await this.edit(i,summary);
        for(const payload of attachments)await i.followUp({...payload,flags:MessageFlags.Ephemeral});
      } else {
        const cohort=await this.cohort(i.guild);
        const ranks=action==='poor'
          ?cohort?await this.store.poorRanking(this.botId(),cohort):await this.store.poorRanking(this.botId())
          :action==='world'?await this.store.ranking(this.botId())
          :cohort?await this.store.ranking(this.botId(),10,cohort):await this.store.ranking(this.botId());
        const title=action==='poor'?'💸 貧乏ランキング · Top 10':action==='world'?'🌍 富豪ランキング · Top 10（グローバル）':'🏆 富豪ランキング · Top 10（サーバー内）';
        await this.edit(i,card(title,ranks.map((p,n)=>`**${n+1}位** <@${p.user_id}> · **${formatAmount(p.points)}pt**`).join('\n')||'該当するプレイヤーがいません。','info',[row(button(`eco:rankings:${key}`,'さらに表示（txt）',ButtonStyle.Secondary))]));
      }
      return;
    }
    if(action==='login'||action==='future') {
      if(key!==i.user.id)return i.reply({...card('操作できません','このボタンはコマンドを実行した人専用です。','warning'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
      await i.deferReply({flags:MessageFlags.Ephemeral});
      const cohort=await this.cohort(i.guild);
      if(action==='login'){const now=new Date();const r=await this.store.login(i.user.id,this.botId(),now,cohort);await this.edit(i,loginCard(r,i.user.id,now));}
      else if(action==='future') {
        const account=await this.store.account(i.user.id);const rank=cohort?await this.store.rank(i.user.id,this.botId(),cohort):await this.store.rank(i.user.id,this.botId());
        await this.edit(i,loginForecastCard(account,rank,i.user.id));
      }
      return;
    }
    if(action==='details') {
      const details=this.details.get(key!);
      if(!details||details.expires<Date.now()||details.channelId!==i.channelId)throw new UserError('この結果の詳細は期限切れです。新しくギャンブルを実行してください。');
      await i.deferReply({flags:MessageFlags.Ephemeral});
      await this.edit(i,card('ギャンブルの仕組み',details.body,'info',[],undefined,undefined,undefined,0x5865f2));return;
    }
    const data=this.confirms.get(key!);
    if(!data||data.expires<Date.now()||data.owner!==i.user.id||data.channelId!==i.channelId)return i.reply({...card('確認を開き直してください','期限切れ、または別の人の確認画面です。','warning'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
    if(action==='mechanism') {
      if(data.kind!=='gamble')throw new UserError('この操作はギャンブル専用です。');
      await i.reply({...card('ギャンブルの仕組み',`**1. 賭け金の決定**\n- プラス残高は所持額の約1/3〜全額から抽選。\n- 借金中は借金額の **5〜約10.89%** から抽選（端数切り捨て・最低100pt）。\n- 残高0ptの場合は **100pt**。\n\n**2. 倍率の抽選**\n- 85%: ±1.51〜3.00倍 · 当たり **72%**\n- 13%: ±3.01〜5.00倍 · 当たり **62%**\n- 2%: ±5.01〜10.00倍 · 当たり **57%**\n- 大きい倍率ほど当たりにくく、期待値は **±0**（還元率100%）。\n\n**3. ポイント変動**\n\`賭け金 × 倍率（小数部分を0方向に切り捨て） − 賭け金\`\n-# 借金中は回数無制限。プラス残高は毎日0時（日本時間）に5回へリセット。`),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return;
    }
    if(action!=='cancel'&&action!=='confirm')throw new UserError('操作が見つかりません。');
    await i.deferUpdate();
    if(this.confirms.get(key!)!==data)throw new UserError('すでに処理済みです。');
    this.confirms.delete(key!);
    if(action==='cancel')return this.edit(i,card('キャンセルしました','ポイントは変動していません。'),true);
    let result;
    try { result=await this.confirm(data,key!); }
    catch(e) {
      if(!(e instanceof UserError)) {
        const failure=exceptionCards(e,`economy:${data.kind}`),detail=failure.response;
        postErrorLog(failure.diagnostic as Record<string,unknown>);
        if(isPublicChannel(i.channelId))return this.edit(i,detail,true);
        await this.edit(i,card('処理エラー','**処理を完了できませんでした。**\n詳細は本人向けの返信を確認してください。','danger'),true);
        return i.followUp({...detail,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
      }
      return this.edit(i,card('実行できませんでした',`${e.message}\n\nコマンドを実行して、最新の残高から確認し直してください。`,'warning'),true);
    }
    const response=await this.edit(i,result,true);
    return response;
  }
  private async confirm(data:Confirm,key:string) {
    if(data.kind==='bankrupt') {
      const result=await this.store.bankrupt(data.owner);
      return card('自己破産 · 完了',`借金 **${formatAmount(result.debt)}pt** を0にしました。\n**連続ログイン** · リセット(次回は1日目から)\n**ギャンブル・bet** · ${result.banDays}日間利用できません(${result.banUntil}まで)\n**次の破産** · ${result.nextDate}から可能(${result.cooldownDays}日間)\n-# ${result.times}回目の破産です。`,'info');
    }
    if(data.kind==='give') {
      const result=await this.store.transfer(`give:${key}`,data.owner,data.target!,data.amount!);
      return card('送金完了',`<@${data.target}> に **${data.amount}pt** を送りました。\n**手数料** · **${result.fee}pt**\n**現在のポイント** · **${result.balance}pt**`,'success');
    }
    const result=await this.store.accounts([data.owner],async(a,c)=>{
      const account=a.get(data.owner)!;const current=account.points;const today=jstDate();
      if(account.gambleDate!==today){account.gambleDate=today;account.gambleCount=0;}
      if(current>0n&&account.gambleCount>=5)throw new UserError('今日は5回プレイ済みです。betで遊べます。');
      if(!await this.store.once(c,`gamble:${key}`))throw new UserError('処理済みです。');
      account.gambleCount=Math.min(32767,account.gambleCount+1);
      const {stake,multiplier,delta}=rollGamble(current);account.points+=delta;
      return {current,stake,multiplier,delta,balance:account.points,count:account.gambleCount};
    });
    this.details.set(key,{channelId:data.channelId,expires:Date.now()+buttonLifetimeMs,body:`**1. 賭け金の決定**\n所持ポイント: \`${formatAmount(result.current)}pt\`\nベット: **\`${formatAmount(result.stake)}pt\`**\n\n**2. 倍率の抽選**\n抽選結果: **\`${(result.multiplier/100).toFixed(2)}倍\`**\n85%で±1.51〜3.00倍 / 13%で±3.01〜5.00倍 / 2%で±5.01〜10.00倍。\n\n**3. ポイント変動**\n\`(${formatAmount(result.stake)} × ${(result.multiplier/100).toFixed(2)}) − ${formatAmount(result.stake)}\`\n> **${result.delta>=0n?'+':''}${formatAmount(result.delta)}pt** → 残高 **${formatAmount(result.balance)}pt**${result.current<=0n&&result.balance>0n?'\n🎉 **借金からの帰還！**':''}\n-# 掛け算の小数部分を0方向に切り捨ててから賭け金を引きます。`});
    const outcome=result.multiplier>500?{text:'🎉 __**超大当たり！！**__',color:0xf1c40f}:result.multiplier>300?{text:'🎊 **大当たり！**',color:0x2ecc71}:result.multiplier< -500?{text:'💀 __**世紀の大失敗！！**__',color:0x640000}:result.multiplier< -300?{text:'💸 **大失敗…**',color:0xe74c3c}:result.multiplier>0?{text:'**ちょい勝ち！**',color:0x979c9f}:{text:'**ちょい負け…**',color:0x607d8b};
    return card('ハイリスクギャンブル · 結果',`<@${data.owner}> が **\`${formatAmount(result.stake)}pt\`** をベット · 結果は **\`${(result.multiplier/100).toFixed(2)}倍\`**\n> ${outcome.text}\n**ポイント変動** · **\`${result.delta>=0n?'+':''}${formatAmount(result.delta)}pt\`**\n**現在のポイント** · \`${formatAmount(result.balance)}pt\`\n-# 今日の残り: ${result.balance>0n?`${Math.max(0,5-result.count)}回`:'無制限（救済措置）'}`,result.delta>=0n?'success':'warning',[row(button(`again:gamble:${data.owner}`,'もう一度ギャンブル',ButtonStyle.Primary),button(`eco:details:${key}`,'仕組み',ButtonStyle.Secondary,'⚙️'))],undefined,undefined,undefined,outcome.color);
  }
}
