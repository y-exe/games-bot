import {UserError} from '../errors.js';
import { randomInt, randomUUID } from 'node:crypto';
import { ButtonStyle, MessageFlags, type ButtonInteraction,type Message } from 'discord.js';
import { Store } from '../data/store.js';
import { jstDate } from '../data/store.js';
import { card, button, row,disableCardControls } from '../ui/cards.js';
import { Context, positiveAmount } from './context.js';
import { emoji } from '../ui/emojis.js';
import {loginForecast,loginDay,loginReward,nextLoginTime} from '../data/login.js';
import {rollGamble,diceDelta} from '../data/gamble.js';
import {transferFee,formatAmount} from '../data/money.js';
import {exceptionCard,isPublicChannel} from '../ui/errors.js';

interface Confirm { owner:string; target?:string; amount?:bigint; kind:'give'|'gamble'; expires:number; channelId:string;message?:Message }
function loginCard(result:Awaited<ReturnType<Store['login']>>,owner:string,now=new Date()) {
  const next=Math.floor(nextLoginTime(now).getTime()/1000);
  const body=[
    result.received?`**\`+${formatAmount(result.points)}pt\`** を獲得 · __**連続${result.days}日目**__`:'今日のボーナスは受け取り済みです。',
    `**現在のポイント** · \`${formatAmount(result.balance)}pt\``,
    `**現在の順位** · \`${result.rank>0?`${result.rank}位`:'圏外'}\``,
    `**次回の受取** · <t:${next}:F> · <t:${next}:R>`,
    '-# 連続ログイン・ランキング順位でボーナスが増えます。',
    '-# 受取は1日1回 · 日本時間0時に切替 · 10日目の次は1日目',
  ].join('\n');
  return card(result.received?'ログインボーナス':'ログイン済み',body,result.received?'success':'warning',[row(button(`eco:future:${owner}`,'今後のログボ',ButtonStyle.Secondary,emoji('status_info')))],undefined,undefined,undefined,result.received?0xf1c40f:0xe67e22);
}
export function loginForecastCard(account:{lastLogin:string|null;consecutive:number}|undefined,rank:number,owner:string,now=new Date()) {
  const last=account?.lastLogin??null,consecutive=account?.consecutive??0;
  const pending=last!==jstDate(now),days=loginDay(last,consecutive,now);
  const next=Math.floor(nextLoginTime(now).getTime()/1000);
  const upcoming=loginForecast(last,consecutive,rank,now);
  const today=pending?`**今日の未受取** · **\`+${formatAmount(loginReward(days,rank))}pt\`**（${days}日目）\n-# 下のボタンで今日の分を受け取れます。`:`**次回の受取** · <t:${next}:F> · <t:${next}:R>`;
  return card('今後のログインボーナス',`**現在の順位** · \`${rank>0?`${rank}位`:'圏外'}\`\n${today}\n\n**今後7日間の報酬**\n${upcoming.map(d=>`> **${d.offset===1?'明日':`${d.offset}日後`}**（${d.date.slice(5)} / ${d.days}日目） · **\`+${formatAmount(d.points)}pt\`**`).join('\n')}\n-# 今日から毎日受け取り、現在の順位が続く場合の予測です。\n-# 順位の変動や受取忘れで報酬は変わります。`,'info',pending?[row(button(`eco:login:${owner}`,'今日のログボを受け取る',ButtonStyle.Success,emoji('status_success')))]:[],undefined,undefined,undefined,0x1abc9c);
}
export class Economy {
  private confirms=new Map<string,Confirm>();
  private details=new Map<string,{channelId:string;expires:number;body:string;expire?:()=>Promise<unknown>}>();
  private timer:NodeJS.Timeout;
  constructor(private store: Store,private botId:()=>string) {
    this.timer=setInterval(()=>void this.expire().catch(()=>console.error('ポイント確認の期限処理に失敗しました。')),5_000);
    this.timer.unref();
  }
  async expire(now=Date.now()) {
    const expired=[...this.confirms].filter(([,v])=>v.expires<=now);
    for(const [key,data] of expired) {
      this.confirms.delete(key);
      if(data.message)await data.message.edit(card('確認の時間切れ',`${data.kind==='give'?'送金':'ギャンブル'}は実行されませんでした。\n-# ポイントは変動していません。コマンドから確認を開き直してください。`,'warning')).catch(()=>{});
    }
    for(const [key,data] of this.details)if(data.expires<=now){this.details.delete(key);if(data.expire)await data.expire().catch(()=>{});}
  }
  close() {clearInterval(this.timer);}
  async run(name:string,ctx:Context) {
    if(name==='point') {
      const points=await this.store.balance(ctx.user.id);const ranks=await this.store.ranking(this.botId());const rank=await this.store.rank(ctx.user.id,this.botId());const poor=await this.store.poorRanking(this.botId());
      const poorRank=points<0n?await this.store.poorRank(ctx.user.id,this.botId()):-1;
      const account=await this.store.account(ctx.user.id);const gambleCount=account?.gambleDate===jstDate()?account.gambleCount:0;
      const gambleLine=points>0n?`**今日のギャンブル** · **${Math.max(0,5-gambleCount)} / 5回**`:'**今日のギャンブル** · **無制限（救済措置）**';
      const list=(entries:typeof ranks,medals=false)=>entries.map((p,i)=>`${medals&&i<3?['🥇 ','🥈 ','🥉 '][i]:''}**${i+1}位** <@${p.user_id}> · **${formatAmount(p.points)}pt**`).join('\n');
      return ctx.send(card('ゲームポイントランキング',`**あなたのポイント** · **${formatAmount(points)}pt**\n**富豪ランク** · **${rank>0?`${rank}位`:'圏外'}**${poorRank>0?` · 貧乏ランク **${poorRank}位**`:''}\n${gambleLine}\n\n**🏆 富豪ランキング · Top 5**\n${list(ranks.slice(0,5),true)||'まだプレイヤーがいません。'}${poor.length?`\n\n**💸 貧乏ランキング · Top 3**\n${list(poor.slice(0,3))}`:''}`,'success',[row(button(`eco:login:${ctx.user.id}`,'ログインボーナス',ButtonStyle.Success,emoji('status_success')),button(`eco:point:${ctx.user.id}`,'富豪 Top 10',ButtonStyle.Secondary,emoji('status_info')),button(`eco:poor:${ctx.user.id}`,'貧乏 Top 10',ButtonStyle.Secondary,emoji('status_pending')),button(`eco:rankings:${ctx.user.id}`,'さらに表示',ButtonStyle.Secondary))], undefined,undefined,undefined,0xf1c40f));
    }
    if(name==='login') {
      const now=new Date();const result=await this.store.login(ctx.user.id,this.botId(),now);
      return ctx.send(loginCard(result,ctx.user.id,now));
    }
    if(name==='bet') {
      const amount=positiveAmount(ctx.text('amount'));const dice=randomInt(1,7);
      const delta=diceDelta(amount,dice);
      const balance=await this.store.accounts([ctx.user.id],async(a,c)=>{
        if(!await this.store.once(c,`bet:${ctx.id}`))throw new UserError('すでに処理済みです。');
        const account=a.get(ctx.user.id)!;if(account.points<amount)throw new UserError(`残高不足です。現在 ${account.points}pt あります。`);
        account.points+=delta;return account.points;
      });
      return ctx.send(card('ダイスベット結果',`${emoji(`${dice}_o`)} **${['大凶','凶','小吉','吉','中吉','大吉'][dice-1]}**\n${['賭け金を失いました。','賭け金の半分を失いました。','賭け金の半分を失いました。','ポイントは変わりません。','賭け金の半分を獲得。','賭け金と同額を獲得！'][dice-1]}\n<@${ctx.user.id}> · ベット **${formatAmount(amount)}pt**\n\n**ポイント変動** · **${delta>=0n?'+':''}${formatAmount(delta)}pt**\n**現在のポイント** · **${formatAmount(balance)}pt**`,delta>=0n?'success':'warning',[row(button(`again:bet:${amount}`,'もう一度bet',ButtonStyle.Primary,emoji(`${dice}_o`)),button(`eco:point:${ctx.user.id}`,'残高・順位を見る',ButtonStyle.Secondary,emoji('status_info')))],undefined,undefined,undefined,0x9b59b6));
    }
    const key=randomUUID();const data: Confirm={owner:ctx.user.id,kind:name as 'give'|'gamble',expires:Date.now()+60_000,channelId:ctx.channelId};
    let body='';
    if(name==='give') {
      const target=await ctx.target('user');if(!target||target.bot||target.id===ctx.user.id)throw new UserError('自分以外のユーザーを送金先に指定してください。');
      data.target=target.id;data.amount=positiveAmount(ctx.text('amount',1));
      const fee=transferFee(data.amount);const balance=await this.store.balance(ctx.user.id);
      if(balance<data.amount+fee)throw new UserError(`残高不足です。手数料込みで ${data.amount+fee}pt 必要です。`);
      body=`**送金先** · <@${target.id}>\n**送金額** · **${formatAmount(data.amount)}pt**\n**手数料（15%）** · **${formatAmount(fee)}pt**\n\n**合計支払額** · **${formatAmount(data.amount+fee)}pt**\n**送金後のポイント** · **${formatAmount(balance-data.amount-fee)}pt**\n-# 内容を確認して「送金する」を押してください。`;
    } else {
      const account=await this.store.account(ctx.user.id);const balance=account?.points??0n;
      const count=account?.gambleDate===jstDate()?account.gambleCount:0;
      if(balance>0n&&count>=5)throw new UserError('今日は5回プレイ済みです。betで遊べます。');
      body=`**現在のポイント** · \`${formatAmount(balance)}pt\`\n**本日の残り** · ${balance>0n?`**${5-count} / 5回**`:'**無制限（救済措置）**'}\n\n**ギャンブルの仕組み**\n- 賭け金・倍率はランダム。\n- 倍率は **±1.51〜10.00倍**。\n- プラス残高は **1日5回**、借金中は **回数無制限**。\n-# ポイント変動 = 賭け金 × 倍率 − 賭け金`;
    }
    await this.expire();
    for(const [k,v] of this.details)if(v.expires<Date.now())this.details.delete(k);
    this.confirms.set(key,data);
    const message=await ctx.send(card(name==='give'?'送金を確認':'ハイリスクギャンブル',body,'warning',[row(button(`eco:confirm:${key}`,name==='give'?'送金する':'実行する',ButtonStyle.Danger),button(`eco:cancel:${key}`,'キャンセル',ButtonStyle.Secondary),...(name==='gamble'?[button(`eco:mechanism:${key}`,'仕組み',ButtonStyle.Secondary,'⚙️')]:[]))], '確認は60秒以内'));
    data.message=message;return message;
  }
  async handle(i:ButtonInteraction) {
    const [,action,key]=i.customId.split(':');
    if(action==='login'||action==='point'||action==='poor'||action==='future'||action==='rankings') {
      if(key!==i.user.id)return i.reply({...card('操作できません','このボタンはコマンドを実行した人専用です。','warning'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
      await i.deferReply({flags:MessageFlags.Ephemeral});
      if(action==='login'){const now=new Date();const r=await this.store.login(i.user.id,this.botId(),now);await i.editReply(loginCard(r,i.user.id,now));}
      else if(action==='rankings') {
        const rich=await this.store.ranking(this.botId());const poor=await this.store.poorRanking(this.botId());
        const lines=(entries:typeof rich)=>entries.map((p,index)=>`**${index+1}位** <@${p.user_id}> · \`${p.points}pt\``).join('\n')||'該当するプレイヤーがいません。';
        await i.editReply(card('ゲームポイント · 詳細ランキング',`**🏆 富豪 Top 10**\n${lines(rich)}\n\n**💸 貧乏 Top 10**\n${lines(poor)}`,'info',[],undefined,undefined,undefined,0xf1c40f));
      }
      else if(action==='future') {
        const account=await this.store.account(i.user.id);const rank=await this.store.rank(i.user.id,this.botId());
        await i.editReply(loginForecastCard(account,rank,i.user.id));
      }
      else{const ranks=action==='poor'?await this.store.poorRanking(this.botId()):await this.store.ranking(this.botId());await i.editReply(card(action==='poor'?'💸 貧乏ランキング · Top 10':'🏆 富豪ランキング · Top 10',ranks.map((p,n)=>`**${n+1}位** <@${p.user_id}> · **${p.points}pt**`).join('\n')||'該当するプレイヤーがいません。'));}
      return;
    }
    if(action==='details') {
      const details=this.details.get(key!);
      if(!details||details.expires<Date.now()||details.channelId!==i.channelId)throw new UserError('この結果の詳細は期限切れです。新しくギャンブルを実行してください。');
      await i.reply({...card('ギャンブルの仕組み',details.body,'info',[],undefined,undefined,undefined,0x5865f2),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return;
    }
    const data=this.confirms.get(key!);
    if(!data||data.expires<Date.now()||data.owner!==i.user.id||data.channelId!==i.channelId)return i.reply({...card('確認を開き直してください','期限切れ、または別の人の確認画面です。','warning'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
    if(action==='mechanism') {
      if(data.kind!=='gamble')throw new UserError('この操作はギャンブル専用です。');
      await i.reply({...card('ギャンブルの仕組み',`**1. 賭け金の決定**\n- プラス残高は所持額の約1/3〜全額から抽選。\n- −100〜0ptは **100pt**。それより下は借金額の1/6〜1/2。\n\n**2. 倍率の抽選**\n- 85%: ±1.51〜3.00倍\n- 13%: ±3.01〜5.00倍\n- 2%: ±5.01〜10.00倍\n- 正負は各50%。\n\n**3. ポイント変動**\n\`賭け金 × 倍率（小数部分を0方向に切り捨て） − 賭け金\`\n-# 借金中は回数無制限。プラス残高は毎日0時（日本時間）に5回へリセット。`),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});return;
    }
    if(action!=='cancel'&&action!=='confirm')throw new UserError('操作が見つかりません。');
    this.confirms.delete(key!);await i.deferUpdate();
    if(action==='cancel')return i.editReply(card('キャンセルしました','ポイントは変動していません。'));
    let result;
    try { result=await this.confirm(data,key!); }
    catch(e) {
      if(!(e instanceof UserError)) {
        if(isPublicChannel(i.channelId))return i.editReply(exceptionCard(e,`economy:${data.kind}`));
        await i.editReply(card('処理エラー','**処理を完了できませんでした。**\n詳細は本人向けの返信を確認してください。','danger'));
        return i.followUp({...exceptionCard(e,`economy:${data.kind}`),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
      }
      return i.editReply(card('実行できませんでした',`${e.message}\n\nコマンドを実行して、最新の残高から確認し直してください。`,'warning'));
    }
    const response=await i.editReply(result);
    const details=this.details.get(key!);
    if(details)details.expire=()=>i.editReply(disableCardControls(result));
    return response;
  }
  private async confirm(data:Confirm,key:string) {
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
    this.details.set(key,{channelId:data.channelId,expires:Date.now()+180_000,body:`**1. 賭け金の決定**\n所持ポイント: \`${formatAmount(result.current)}pt\`\nベット: **\`${formatAmount(result.stake)}pt\`**\n\n**2. 倍率の抽選**\n抽選結果: **\`${(result.multiplier/100).toFixed(2)}倍\`**\n85%で±1.51〜3.00倍 / 13%で±3.01〜5.00倍 / 2%で±5.01〜10.00倍。\n\n**3. ポイント変動**\n\`(${formatAmount(result.stake)} × ${(result.multiplier/100).toFixed(2)}) − ${formatAmount(result.stake)}\`\n> **${result.delta>=0n?'+':''}${formatAmount(result.delta)}pt** → 残高 **${formatAmount(result.balance)}pt**${result.current<=0n&&result.balance>0n?'\n🎉 **借金からの帰還！**':''}\n-# 掛け算の小数部分を0方向に切り捨ててから賭け金を引きます。`});
    const outcome=result.multiplier>500?{text:'🎉 __**超大当たり！！**__',color:0xf1c40f}:result.multiplier>300?{text:'🎊 **大当たり！**',color:0x2ecc71}:result.multiplier< -500?{text:'💀 __**世紀の大失敗！！**__',color:0x640000}:result.multiplier< -300?{text:'💸 **大失敗…**',color:0xe74c3c}:result.multiplier>0?{text:'**ちょい勝ち！**',color:0x979c9f}:{text:'**ちょい負け…**',color:0x607d8b};
    return card('ハイリスクギャンブル · 結果',`<@${data.owner}> が **\`${formatAmount(result.stake)}pt\`** をベット · 結果は **\`${(result.multiplier/100).toFixed(2)}倍\`**\n> ${outcome.text}\n**ポイント変動** · **\`${result.delta>=0n?'+':''}${formatAmount(result.delta)}pt\`**\n**現在のポイント** · \`${formatAmount(result.balance)}pt\`\n-# 今日の残り: ${result.balance>0n?`${Math.max(0,5-result.count)}回`:'無制限（救済措置）'}`,result.delta>=0n?'success':'warning',[row(button('again:gamble','もう一度ギャンブル',ButtonStyle.Primary),button(`eco:details:${key}`,'仕組み',ButtonStyle.Secondary,'⚙️'))],undefined,undefined,undefined,outcome.color);
  }
}
