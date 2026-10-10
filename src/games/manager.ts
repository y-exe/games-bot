import {UserError} from '../errors.js';
import { ActionRowBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, type ButtonInteraction, type Client, type Message, type MessageCreateOptions, type StringSelectMenuInteraction } from 'discord.js';
import { randomInt, randomUUID } from 'node:crypto';
import { Othello, ConnectFour, type Player } from './board.js';
import { Store } from '../data/store.js';
import { card, button, row, type CardRow, type Status } from '../ui/cards.js';
import { boardText,markerName,markerLabel,movesPerPage } from '../ui/board-text.js';
import { emoji, handEmojis } from '../ui/emojis.js';
import { settings } from '../config.js';
import {rewards,botRewards,othelloReward} from '../data/rewards.js';
import {formatAmount} from '../data/money.js';
import {exceptionCard} from '../ui/errors.js';
import {requireButtonOwner} from '../commands/button-owner.js';

export type GameKind = 'othello' | 'connectfour' | 'janken' | 'highlow';
type Hand = keyof typeof handEmojis;
interface Session {
  id: string; kind: GameKind; host: string; target?: string; players: string[];
  phase: 'recruiting'|'playing'|'finished'; revision: number; expires: number;
  channelId: string; messageId: string; size: number; page: number;
  board?: Othello|ConnectFour; hands: Record<string,string>; currentCard: number;
  bet: string; escrow: boolean; result?: string; resultStatus?:Status;
}
const names: Record<GameKind,string> = {othello:'オセロ',connectfour:'四目並べ',janken:'じゃんけん',highlow:'ハイアンドロー'};
const recruitmentTimeout:Record<GameKind,number>={othello:300_000,connectfour:300_000,janken:180_000,highlow:120_000};
function playingTimeout(kind:GameKind){return kind==='janken'||kind==='highlow'?60_000:settings.turnTimeoutMs;}
export class Games {
  private replays=new Map<string,{owner:string;kind:GameKind;size:number;bet:string;channelId:string;expires:number}>();
  readonly sessions = new Map<string,Session>();
  private locks = new Map<string,Promise<unknown>>();
  private timer?: NodeJS.Timeout;
  private leaveTimers=new Map<string,NodeJS.Timeout>();
  trackLeave(messageId:string,edit:(payload:ReturnType<typeof card>)=>Promise<unknown>) {
    const timer=setTimeout(()=>{
      this.leaveTimers.delete(messageId);
      void edit(card('確認の時間切れ','終了の確認は取り消されました。ゲームは終了していません。\n-# 元のゲーム画面を確認するか、`leave` で確認を開き直してください。','warning')).catch(()=>{});
    },30_000);
    timer.unref();this.leaveTimers.set(messageId,timer);
  }
  private clearLeave(messageId:string) {const timer=this.leaveTimers.get(messageId);if(timer)clearTimeout(timer);this.leaveTimers.delete(messageId);}
  constructor(private client: Client, private store: Store) {}
  private async locked<T>(key: string, work: ()=>Promise<T>) {
    const pending=(this.locks.get(key)??Promise.resolve()).catch(()=>{}).then(work);
    this.locks.set(key,pending);
    try{return await pending;}finally{if(this.locks.get(key)===pending)this.locks.delete(key);}
  }
  private busy(id: string, except?: string) { return [...this.sessions.values()].some(s=>s.id!==except&&s.phase!=='finished'&&(s.host===id||s.players.includes(id))); }
  async create(kind: GameKind, host: string, channelId: string, send: (payload: Awaited<ReturnType<Games['payload']>>)=>Promise<Message>, target?: string, size=8, bet=0n) {
    return this.locked('recruiting',async()=>{
      if(this.busy(host))throw new UserError('参加中・募集中のゲームがあります。先に終了してください。');
      if(target===host)throw new UserError('自分を対戦相手に指定できません。');
      if(kind==='othello'&&![6,8,10].includes(size))throw new UserError('盤面は6・8・10から選んでください。');
      if(kind==='highlow'&&target===this.client.user!.id)throw new UserError('ハイローは人同士で対戦してください。Botは指名できません。');
      if(kind==='highlow'&&bet<=0n)throw new UserError('賭け金は1ポイント以上にしてください。');
      const s: Session={id:randomUUID(),kind,host,target,players:[host],phase:'recruiting',revision:0,expires:Date.now()+recruitmentTimeout[kind],channelId,messageId:'',size,page:0,hands:{},currentCard:randomInt(1,14),bet:String(bet),escrow:false};
      if(kind==='highlow'&&await this.store.balance(host)<bet)throw new UserError('賭け金のポイントが不足しています。');
      const message=await send(await this.payload(s)); s.messageId=message.id;
      this.sessions.set(s.id,s); await this.save(s);
      return s;
    });
  }
  private id(s: Session, action: string) { return `game:${s.id}:${s.revision}:${action}`; }
  async payload(s: Session) {
    const controls: CardRow[]=[]; let body='';
    if(s.phase==='recruiting') {
      body=`<@${s.host}> が対戦相手を募集中 · **${formatAmount(await this.store.balance(s.host))}pt**${s.target?`\n**対戦相手** · <@${s.target}>`:''}\n${s.kind==='highlow'?`**賭け金** · **${formatAmount(s.bet)}pt / 人**\n-# 両者正解は返金、両者不正解は没収。`:s.kind==='othello'?`**盤面** · **${s.size} × ${s.size}**\n-# 募集者は下のメニューでサイズを変更できます。`:'-# 対戦が始まるまでポイントは動きません。'}\n\n**承認する** で参加 · 募集者は **キャンセル** で取消\n-# 募集終了 <t:${Math.floor(s.expires/1000)}:R>`;
      if(s.target===this.client.user!.id)body=body.replace('**承認する** で参加 · 募集者は **キャンセル** で取消','募集者は **Botと対戦** で開始 · **キャンセル** で取消');
      const recruitButtons=[button(this.id(s,'join'),'承認する',ButtonStyle.Success,emoji('status_success'),s.target===this.client.user!.id),button(this.id(s,'cancel'),'キャンセル',ButtonStyle.Secondary,emoji('status_warning'))];
      if(s.kind!=='highlow')recruitButtons.push(button(this.id(s,'bot'),'Botと対戦',ButtonStyle.Primary,emoji('status_info'),s.kind==='othello'&&Boolean(s.target)&&s.target!==this.client.user!.id));
      controls.push(row(...recruitButtons));
      if(s.kind==='othello')controls.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(this.id(s,'size')).setPlaceholder('盤面サイズ').addOptions([6,8,10].map(n=>({label:`${n} × ${n}`,value:String(n),default:s.size===n})))));
    } else if(s.phase==='finished')body=`${s.result??'このゲームは終了しました。'}${s.board?`\n\n**最終盤面**\n${boardText(s.board)}`:''}`;
    else if(s.board) {
      if(s.board instanceof Othello)s.page=Math.max(0,Math.min(s.page,Math.ceil(s.board.moves().length/movesPerPage)-1));
      const players=await Promise.all(s.players.map(async(p,i)=>`${emoji(s.kind==='othello'?(i===0?'o2':'o1'):(i===0?'4_1':'4_2'))} <@${p}> · **${formatAmount(await this.store.balance(p))}pt**`));
      body=`${players.join('\n')}\n\n${boardText(s.board,s.page)}\n\n${s.board instanceof Othello?`**スコア** · ${emoji('o2')} **${s.board.score()[0]}** − ${emoji('o1')} **${s.board.score()[1]}**\n`:''}${emoji('status_info')} **<@${s.players[s.board.turn-1]}> の番です**${s.board instanceof Othello&&s.board.passed?'\n-# 相手は置ける場所がないためパスしました。':''}\n-# ${s.board instanceof Othello?'盤面の数字・文字と同じボタンで石を置きます。':'盤面下の数字と同じ列にコマを落とします。'}\n-# 手番の期限 <t:${Math.floor(s.expires/1000)}:R>`;
      if(s.board instanceof Othello) {
        const all=s.board.moves();const pages=Math.ceil(all.length/movesPerPage);const candidates=all.slice(s.page*movesPerPage,(s.page+1)*movesPerPage);
        for(let start=0;start<candidates.length;start+=5)controls.push(row(...candidates.slice(start,start+5).map((m,index)=>button(this.id(s,`place${m.row},${m.col}`),markerLabel(start+index),ButtonStyle.Secondary,emoji(markerName(start+index))))));
        const navigation=pages>1?[button(this.id(s,'prev'),'前の候補',ButtonStyle.Secondary,undefined,s.page===0),button(this.id(s,'next'),`次の候補 (${s.page+1}/${pages})`,ButtonStyle.Secondary,undefined,s.page===pages-1)]:[];
        controls.push(row(...navigation,button(this.id(s,'leave'),'投了する',ButtonStyle.Secondary,emoji('status_warning'))));
      } else {
        for(const cols of [[0,1,2,3],[4,5,6]]) controls.push(row(...cols.map(c=>button(this.id(s,`col${c}`),`${c+1}列`,ButtonStyle.Primary,emoji(`${c+1}_o`),!s.board!.board[0]||s.board!.board[0]![c]!==0))));
        controls.push(row(button(this.id(s,'leave'),'投了する',ButtonStyle.Secondary,emoji('status_warning'))));
      }
    } else {
      body=`${s.players.map(p=>`${emoji(s.hands[p]?'status_success':'status_pending')} <@${p}> · **${s.hands[p]?'選択済み':'選択待ち'}**`).join('\n')}\n\n${s.kind==='highlow'?`**現在のカード** · **${this.cardLabel(s.currentCard)}**\n**賭け金** · **${formatAmount(s.bet)}pt / 人**\n次のカードが **High** か **Low** かを選んでください。\n-# 同じ数字は引き直します。\n-# 単独正解 · 賭け金の **2倍** ／ 両者正解 · 返金 ／ 両者不正解 · 没収`:'**グー・チョキ・パー** から選んでください。\n-# 手は両者が選ぶまで公開されません。'}\n-# 選択期限 <t:${Math.floor(s.expires/1000)}:R>`;
      controls.push(s.kind==='janken'?row(...(Object.entries(handEmojis) as [Hand,string][]).map(([h,e])=>button(this.id(s,h),h==='rock'?'グー':h==='scissors'?'チョキ':'パー',ButtonStyle.Primary,e))):row(button(this.id(s,'high'),'HIGH',ButtonStyle.Primary,'⬆️'),button(this.id(s,'low'),'LOW',ButtonStyle.Secondary,'⬇️')));
      controls.push(row(button(this.id(s,'leave'),'対戦を終了',ButtonStyle.Secondary)));
    }
    if(s.phase==='finished') {
      for(const [key,replay] of this.replays)if(replay.expires<=Date.now())this.replays.delete(key);
      this.replays.set(s.id,{owner:s.host,kind:s.kind,size:s.size,bet:s.bet,channelId:s.channelId,expires:Date.now()+600_000});
      controls.push(row(button(`replay:${s.id}`,'もう一度募集する',ButtonStyle.Primary,emoji('status_pending'))));
    }
    const accent=s.board?(s.kind==='othello'?(s.phase==='finished'?0x607d8b:0x2ecc71):(s.phase==='finished'?(s.board.winner===0?0x979c9f:0xf1c40f):0x3498db)):(s.phase==='finished'&&s.kind==='janken'&&['success','info'].includes(s.resultStatus??'success')?0xf1c40f:undefined);
    const result=card(`${names[s.kind]}${s.kind==='othello'?` (${s.size}×${s.size})`:''}${s.phase==='finished'?' · 結果':''}`,body,s.phase==='finished'?(s.resultStatus??'success'):s.phase==='recruiting'?'pending':'info',controls,`対戦 #${s.id.slice(0,8)}`,undefined,undefined,accent);
    return {...result,files:[],attachments:[]};
  }
  private cardLabel(n: number) { return ({1:'A',11:'J',12:'Q',13:'K'} as Record<number,string>)[n]??String(n); }
  private async save(s: Session) { await this.store.saveSession(s.id,s); }
  private async message(s: Session) {
    const channel=await this.client.channels.fetch(s.channelId);
    if(!channel?.isTextBased()||!('messages' in channel))throw new UserError('ゲームのチャンネルにアクセスできません。');
    return channel.messages.fetch(s.messageId);
  }
  private async redraw(s: Session) {
    const payload=await this.payload(s);
    try {await (await this.message(s)).edit(payload);}
    catch(e) {
      if((e as {code?:number}).code!==10008)throw e;
      const channel=await this.client.channels.fetch(s.channelId);
      if(!channel?.isSendable())return;
      const message=await channel.send(payload as MessageCreateOptions);
      s.messageId=message.id;await this.save(s);
    }
  }
  async handle(i: ButtonInteraction|StringSelectMenuInteraction) {
    const [,id,rev,rawAction]=i.customId.split(':');
    const [action,deadline]=rawAction?.split('~')??[];
    if(!id||!action)return;
    await i.deferUpdate();
    try { const work=()=>this.locked(id,async()=>{
      const s=this.sessions.get(id);
      if(!s||s.phase==='finished')throw new UserError('この対戦は終了しています。新しいゲームを始めてください。');
      if((s.messageId!==i.message.id&&!action.startsWith('resign')&&!action.startsWith('keep')&&action!=='cancel')||s.channelId!==i.channelId)throw new UserError('対戦のメッセージが一致しません。');
      if(deadline&&(!/^\d{13}$/.test(deadline)||Date.now()>=Number(deadline)))throw new UserError('確認の30秒が経過しました。`leave` で開き直してください。');
      if(action===`keep${i.user.id}`) {
        if(s.host!==i.user.id&&!s.players.includes(i.user.id))throw new UserError('対戦中のプレイヤーのみ操作できます。');
        this.clearLeave(i.message.id);await i.editReply(card('対戦を継続します','終了を取り消しました。元のゲーム画面から続けてください。','info'));return;
      }
      if((s.board||s.phase==='recruiting')&&s.revision!==Number(rev))throw new UserError('盤面が更新されました。最新の画面から選び直してください。');
      if(Date.now()>=s.expires){await this.expire(s);throw new UserError('この操作は時間切れになりました。');}
      if(s.phase==='recruiting') {
        if(action==='cancel') { if(i.user.id!==s.host)throw new UserError('募集者のみ取り消せます。');this.clearLeave(i.message.id); await this.finish(s,'募集を取り消しました。',false,'warning'); return; }
        if(action==='size') {
          if(s.kind!=='othello'||i.user.id!==s.host||!i.isStringSelectMenu())throw new UserError('盤面サイズはオセロの募集者のみ変更できます。');
          const size=Number(i.values[0]); if(![6,8,10].includes(size))throw new UserError('サイズが無効です。');s.size=size;
        } else if(action==='join'||action==='bot') {
          const opponent=action==='bot'?this.client.user!.id:i.user.id;
          if(action==='bot'&&(i.user.id!==s.host||s.kind==='highlow'))throw new UserError('この対戦ではBotを選べません。');
          if(action==='bot'&&s.kind==='othello'&&s.target&&s.target!==this.client.user!.id)throw new UserError('指名対戦ではBotを選べません。募集を取り消して自由募集を始めてください。');
          if(opponent===s.host)throw new UserError('募集者は参加ボタンを押せません。Botと対戦することもできます。');
          if(action==='join'&&s.target&&s.target!==opponent)throw new UserError('指名された対戦相手のみ参加できます。');
          if(opponent!==this.client.user!.id&&this.busy(opponent,s.id))throw new UserError('すでに別の対戦に参加しています。');
          const players=randomInt(2)===0?[s.host,opponent]:[opponent,s.host];
          if(s.kind==='highlow') {
            const started: Session={...s,players,escrow:true,phase:'playing',expires:Date.now()+playingTimeout(s.kind),revision:s.revision+1};
            await this.store.accounts(players,async(a,c)=>{
              for(const p of players)if(a.get(p)!.points<BigInt(s.bet))throw new UserError('参加者の賭け金が不足しています。');
              if(!await this.store.once(c,`stake:${s.id}`))throw new UserError('この対戦は開始済みです。');
              for(const p of players)a.get(p)!.points-=BigInt(s.bet);
              await c.query('UPDATE games_bot_sessions SET payload=$2 WHERE session_id=$1',[s.id,JSON.stringify(started)]);
            });
            Object.assign(s,started);
          } else {
            s.players=players;
            s.phase='playing';s.board=s.kind==='othello'?new Othello(s.size):s.kind==='connectfour'?new ConnectFour():undefined;
          }
          await this.botTurn(s);
        } else throw new UserError('操作が見つかりません。');
      } else {
        if(!s.players.includes(i.user.id))throw new UserError('対戦中のプレイヤーのみ操作できます。');
        if(action==='leave') {
          const confirmation=await i.followUp({...this.leaveCard(s,i.user.id),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
          if(confirmation)this.trackLeave(confirmation.id,p=>i.webhook.editMessage(confirmation.id,p));return;
        }
        if(action===`resign${i.user.id}`) {
          this.clearLeave(i.message.id);
          if(s.board) { s.board.winner=(s.players.indexOf(i.user.id)===0?2:1) as Player; await this.settleBoard(s,'投了'); }
          else await this.finish(s,'参加者が対戦を終了しました。',s.escrow,'warning');
          return;
        }
        if(s.board) {
          if(s.players[s.board.turn-1]!==i.user.id)throw new UserError('今は相手の番です。');
          if(action==='next'||action==='prev') { s.page+=action==='next'?1:-1; }
          else if(s.board instanceof Othello&&action==='move'&&i.isStringSelectMenu()) { const [r,c]=i.values[0]!.split(',').map(Number);s.board.play(r!,c!);s.page=0; }
          else if(s.board instanceof Othello&&/^place\d+,\d+$/.test(action)) {const [r,c]=action.slice(5).split(',').map(Number);s.board.play(r!,c!);s.page=0;}
          else if(s.board instanceof ConnectFour&&/^col[0-6]$/.test(action))s.board.play(Number(action.slice(3)));
          else throw new UserError('置く場所を選んでください。');
          await this.botTurn(s);
          if(s.board.winner!==null) {await this.settleBoard(s);return;}
        } else {
          if(s.hands[i.user.id])throw new UserError('すでに選択済みです。相手の選択を待ってください。');
          if(!(s.kind==='janken'?['rock','scissors','paper']:['high','low']).includes(action))throw new UserError('選択が無効です。');
          s.hands[i.user.id]=action;
          await this.botTurn(s);
          if(s.players.every(p=>s.hands[p])) {await this.settleChoices(s);return;}
          await i.followUp({...card('選択しました','相手の選択を待っています。あなたの選択はまだ公開されません。','success'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
        }
      }
      s.revision++;if(!['size','next','prev'].includes(action))s.expires=Date.now()+playingTimeout(s.kind);await this.save(s);await this.redraw(s);
    }); await (['join','bot'].includes(action)?this.locked('recruiting',work):work()); } catch(e) { await i.followUp({...exceptionCard(e,`game:${action}`),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral}); }
  }
  private async botTurn(s: Session) {
    const bot=this.client.user!.id;
    if(s.board)while(s.board.winner===null&&s.players[s.board.turn-1]===bot) {
      if(s.board instanceof Othello){const m=s.board.botMove();if(!m)break;s.board.play(m.row,m.col);}else{const c=s.board.botMove();if(c===undefined)break;s.board.play(c);}
    }
    else if(s.kind==='janken'&&s.players.includes(bot))s.hands[bot]=(['rock','scissors','paper'] as const)[randomInt(3)]!;
  }
  private async settleBoard(s: Session, reason='') {
    const game=s.board!; const winner=game.winner!;
    const bot=s.players.includes(this.client.user!.id);
    const table=bot?botRewards:rewards;
    const deltas: Record<string,bigint>={};
    if(winner===0)for(const p of s.players)deltas[p]=game instanceof Othello?othelloReward(game.size,0,false,bot).draw:table.connectfour.draw;
    else {
      let {win,lose}=table.connectfour;
      if(game instanceof Othello) {
        const [b,w]=game.score();const diff=Math.abs(b-w);
        const amounts=othelloReward(game.size,reason?(winner===1?b-w:w-b):diff,Boolean(reason),bot);win=amounts.win;lose=amounts.lose;
      }
      deltas[s.players[winner-1]!]=win;deltas[s.players[winner===1?1:0]!]=lose;
    }
    await this.store.reward(`settle:${s.id}`,deltas);
    const scores=game instanceof Othello?`\n**スコア** · ${emoji('o2')} **${game.score()[0]}** − ${emoji('o1')} **${game.score()[1]}**`:''; 
    await this.finish(s,`**${winner===0?'🤝 引き分け！':`🏆 <@${s.players[winner-1]}> の勝ち！`}**${reason?` (${reason})`:''}${scores}\n\n**ポイント変動**\n${Object.entries(deltas).map(([p,n])=>`<@${p}> · **${n>=0n?'+':''}${formatAmount(n)}pt**`).join('\n')}`,false,winner===0?'info':'success');
  }
  private async settleChoices(s: Session) {
    const deltas: Record<string,bigint>={}; let result='';let status:Status='success';
    if(s.kind==='janken') {
      const [a,b]=s.players as [string,string];const first=s.hands[a] as Hand;const second=s.hands[b] as Hand;
      const win=first===second?undefined:({rock:'scissors',scissors:'paper',paper:'rock'}[first]===second?a:b);
      if(!win)status='info';
      result=`<@${a}> ${handEmojis[first]}　vs　<@${b}> ${handEmojis[second]}\n${win?`🏆 <@${win}> の勝ち！`:'🤝 引き分け！'}`;
      const table=s.players.includes(this.client.user!.id)?botRewards:rewards;
      for(const p of s.players)deltas[p]=win?(p===win?table.janken.win:table.janken.lose):table.janken.draw;
    } else {
      let next=randomInt(1,14);while(next===s.currentCard)next=randomInt(1,14);
      const answer=next>s.currentCard?'high':'low';const winners=s.players.filter(p=>s.hands[p]===answer);
      status=winners.length===0?'warning':winners.length===2?'info':'success';
      for(const p of winners)deltas[p]=BigInt(s.bet)*(winners.length===1?2n:1n);
      result=`**${this.cardLabel(s.currentCard)} → ${this.cardLabel(next)}** · 正解は **${answer.toUpperCase()}**\n${s.players.map(p=>`<@${p}>: ${s.hands[p]!.toUpperCase()}`).join('\n')}\n${winners.length===1?`🏆 <@${winners[0]}> が **${formatAmount(BigInt(s.bet)*2n)}pt** 獲得！`:winners.length===2?'🤝 両者正解。賭け金を返金しました。':'💸 両者不正解。賭け金は没収です。'}`;
    }
    const payout=Object.fromEntries(s.players.filter(p=>p!==this.client.user!.id&&(deltas[p]??0n)!==0n).map(p=>[p,deltas[p]!]));
    await this.store.reward(`settle:${s.id}`,payout);s.escrow=false;
    if(s.kind==='janken')result+='\n\n**ポイント変動**\n'+Object.entries(deltas).map(([p,n])=>`<@${p}> · **${n>=0n?'+':''}${formatAmount(n)}pt**`).join('\n');
    await this.finish(s,result,false,status);
  }
  private async finish(s: Session, result: string, refund=false,status:Status='success') {
    if(refund) { const refunded=await this.store.reward(`settle:${s.id}`,Object.fromEntries(s.players.map(p=>[p,BigInt(s.bet)])));if(refunded)result+='\n賭け金を両者に返金しました。'; }
    s.phase='finished';s.result=result;s.resultStatus=status;s.revision++;await this.save(s);
    try {await this.redraw(s);} finally {this.sessions.delete(s.id);await this.store.deleteSession(s.id);}
  }
  private async expire(s: Session) {
    if(s.phase==='playing'&&s.board) { s.board.winner=s.board.turn===1?2:1;await this.settleBoard(s,'時間切れ'); }
    else await this.finish(s,'時間切れで終了しました。',s.escrow,'warning');
  }
  async restore() {
    if(this.timer)clearInterval(this.timer);
    for(const r of await this.store.sessions()) {
      try {
        const s=JSON.parse(r.payload) as Session;
        s.board=undefined;
        await this.finish(s,'Botが再起動したため対戦を終了しました。',s.escrow,'warning');
      }catch(e){console.error(`対戦復旧失敗: ${e instanceof Error?e.message:'unknown'}`);}
    }
    this.timer=setInterval(()=>{
      for(const [key,replay] of this.replays)if(replay.expires<=Date.now())this.replays.delete(key);
      for(const s of this.sessions.values())if(s.expires<=Date.now())void this.locked(s.id,async()=>{if(this.sessions.has(s.id)&&s.expires<=Date.now())await this.expire(s);}).catch(e=>console.error(`期限処理: ${e instanceof Error?e.message:'unknown'}`));
    },10_000);this.timer.unref();
  }
  async leave(userId: string) {
    const s=[...this.sessions.values()].find(s=>s.host===userId||s.players.includes(userId));
    if(!s)throw new UserError('参加中のゲームはありません。');
    return this.leaveCard(s,userId);
  }
  private leaveCard(s:Session,userId:string) {
    const expires=Date.now()+30_000;
    return card('対戦を終了しますか？',s.phase==='recruiting'?'募集を取り消します。':s.board?'投了すると **負け扱い** になります。':s.kind==='highlow'?'賭け金を **両者に返金** して終了します。':'対戦を終了します。','warning',[row(button(this.id(s,`${s.phase==='recruiting'?'cancel':`resign${userId}`}~${expires}`),'はい、終了する',ButtonStyle.Danger),button(this.id(s,`keep${userId}~${expires}`),'いいえ、続ける',ButtonStyle.Secondary))],'確認は30秒以内');
  }
  async replay(i:ButtonInteraction) {
    const replay=this.replays.get(i.customId.slice('replay:'.length));
    if(!replay||replay.expires<=Date.now()||replay.channelId!==i.channelId)throw new UserError('このボタンは期限切れです。自分でゲームのコマンドを実行してください。');
    requireButtonOwner(replay.owner,i.user.id);
    await i.deferReply();
    return this.create(replay.kind,i.user.id,i.channelId,async p=>{await i.editReply(p);return i.fetchReply();},undefined,replay.size,BigInt(replay.bet));
  }
  async close() { if(this.timer)clearInterval(this.timer);for(const timer of this.leaveTimers.values())clearTimeout(timer);this.leaveTimers.clear();await Promise.allSettled(this.locks.values()); }
}
