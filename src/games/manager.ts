import {buttonLifetimeMs} from '../commands/policy.js';
import {trackExpiringButtons} from '../ui/button-expiry.js';
import {UserError} from '../errors.js';
import {ButtonStyle,MessageFlags,type ButtonInteraction,type Client,type Message,type MessageCreateOptions,type StringSelectMenuInteraction} from 'discord.js';
import {randomInt,randomUUID} from 'node:crypto';
import {Othello,ConnectFour,type Player} from './board.js';
import {Store} from '../data/store.js';
import {card,button,row,type Status} from '../ui/cards.js';
import {emoji,handEmojis} from '../ui/emojis.js';
import {rewards,botRewards,othelloReward,chessReward} from '../data/rewards.js';
import {formatAmount} from '../data/money.js';
import {exceptionCard} from '../ui/errors.js';
import {requireButtonOwner} from '../commands/button-owner.js';
import {ChessGame} from './chess.js';
import {Minesweeper,mineLevel,mineLevels} from './minesweeper.js';
import {applyChessAction} from './chess-actions.js';
import {ChessClock,chessTimeControls,type ChessTimeControl} from './chess-clock.js';
import {cardLabel,gameActionId,recruitmentTimeout,playingTimeout,type GameKind,type Hand,type Session} from './session.js';
import {gameCard} from '../ui/game-card.js';
import {playBotTurn} from './bot-turn.js';
export type {GameKind} from './session.js';

export class Games {
  private replays=new Map<string,{owner:string;kind:GameKind;size:number;bet:string;channelId:string;expires:number;timeControl?:ChessTimeControl}>();
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
  async create(kind: GameKind, host: string, channelId: string, send: (payload: Awaited<ReturnType<Games['payload']>>)=>Promise<Message>, target?: string, size=8, bet=0n, difficulty='',timeControl:ChessTimeControl='10+5') {
    return this.locked('recruiting',async()=>{
      if(this.busy(host))throw new UserError('参加中・募集中のゲームがあります。先に終了してください。');
      if(target===host)throw new UserError('自分を対戦相手に指定できません。');
      if(kind==='othello'&&![6,8,10].includes(size))throw new UserError('盤面は6・8・10から選んでください。');
      if(kind==='highlow'&&target===this.client.user!.id)throw new UserError('ハイローは人同士で対戦してください。Botは指名できません。');
      if(kind==='highlow'&&bet<=0n)throw new UserError('賭け金は1ポイント以上にしてください。');
      const s: Session={id:randomUUID(),kind,host,target,players:[host],phase:'recruiting',revision:0,expires:Date.now()+recruitmentTimeout[kind],channelId,messageId:'',size,page:0,hands:{},currentCard:randomInt(1,14),bet:String(bet),escrow:false};
      if(kind==='chess')s.timeControl=timeControl;
      if(kind==='minesweeper'&&difficulty) {s.mines=new Minesweeper(mineLevel(difficulty));s.size=s.mines.size;s.phase='playing';}
      if(kind==='highlow'&&await this.store.balance(host)<bet)throw new UserError('賭け金のポイントが不足しています。');
      const message=await send(await this.payload(s)); s.messageId=message.id;
      this.sessions.set(s.id,s); await this.save(s);
      return s;
    });
  }
  private id(s: Session, action: string) {return gameActionId(s,action);}
  async payload(s:Session) {
    if(s.phase==='finished') {
      for(const [key,replay] of this.replays)if(replay.expires<=Date.now())this.replays.delete(key);
      this.replays.set(s.id,{owner:s.host,kind:s.kind,size:s.size,bet:s.bet,channelId:s.channelId,expires:Date.now()+buttonLifetimeMs,timeControl:s.timeControl??s.chessClock?.control});
    }
    return gameCard(s,this.client.user!.id,id=>this.store.balance(id));
  }
  private async save(s: Session) { await this.store.saveSession(s.id,s); }
  private async message(s: Session) {
    const channel=await this.client.channels.fetch(s.channelId);
    if(!channel?.isTextBased()||!('messages' in channel))throw new UserError('ゲームのチャンネルにアクセスできません。');
    return channel.messages.fetch(s.messageId);
  }
  private async redraw(s: Session) {
    const payload=await this.payload(s);
    try {const message=await (await this.message(s)).edit(payload);if(message)trackExpiringButtons(message);}
    catch(e) {
      if((e as {code?:number}).code!==10008)throw e;
      const channel=await this.client.channels.fetch(s.channelId);
      if(!channel?.isSendable())return;
      const message=await channel.send(payload as MessageCreateOptions);trackExpiringButtons(message);
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
      const actionTime=Date.now();
      if((s.messageId!==i.message.id&&!action.startsWith('resign')&&!action.startsWith('keep')&&action!=='cancel')||s.channelId!==i.channelId)throw new UserError('対戦のメッセージが一致しません。');
      if(deadline&&(!/^\d{13}$/.test(deadline)||Date.now()>=Number(deadline)))throw new UserError('確認の30秒が経過しました。`leave` で開き直してください。');
      if(action===`keep${i.user.id}`) {
        if(s.host!==i.user.id&&!s.players.includes(i.user.id))throw new UserError('対戦中のプレイヤーのみ操作できます。');
        this.clearLeave(i.message.id);await i.editReply(card('対戦を継続します','終了を取り消しました。元のゲーム画面から続けてください。','info'));return;
      }
      if((s.board||s.chess||s.mines||s.phase==='recruiting')&&s.revision!==Number(rev))throw new UserError('盤面が更新されました。最新の画面から選び直してください。');
      if(actionTime>=s.expires){await this.expire(s);throw new UserError('この操作は時間切れになりました。');}
      if(s.phase==='recruiting') {
        if(action==='cancel') { if(i.user.id!==s.host)throw new UserError('実行した本人のみ取り消せます。');this.clearLeave(i.message.id); await this.finish(s,s.kind==='minesweeper'?'ゲームの開始を取り消しました。':'募集を取り消しました。',false,'warning'); return; }
        if(s.kind==='minesweeper') {
          if(i.user.id!==s.host)throw new UserError('難易度は実行した本人のみ選択できます。');
          if(!action.startsWith('difficulty_'))throw new UserError('難易度を選んでください。');
          s.mines=new Minesweeper(mineLevel(action.slice('difficulty_'.length)));
          s.size=s.mines.size;s.phase='playing';
        } else if(action==='clock') {
          if(s.kind!=='chess'||i.user.id!==s.host||!i.isStringSelectMenu()||!Object.hasOwn(chessTimeControls,i.values[0]!))throw new UserError('持ち時間はチェスの募集者のみ変更できます。');
          s.timeControl=i.values[0] as ChessTimeControl;
        } else if(action==='size') {
          if(s.kind!=='othello'||i.user.id!==s.host||!i.isStringSelectMenu())throw new UserError('盤面サイズはオセロの募集者のみ変更できます。');
          const size=Number(i.values[0]); if(![6,8,10].includes(size))throw new UserError('サイズが無効です。');s.size=size;
        } else if(action==='join'||action==='bot') {
          const opponent=action==='bot'?this.client.user!.id:i.user.id;
          if(action==='bot'&&(i.user.id!==s.host||s.kind==='highlow'))throw new UserError('この対戦ではBotを選べません。');
          if(action==='bot'&&['othello','chess'].includes(s.kind)&&s.target&&s.target!==this.client.user!.id)throw new UserError('指名対戦ではBotを選べません。募集を取り消して自由募集を始めてください。');
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
            if(s.kind==='chess') {s.chess=new ChessGame();s.chessClock=new ChessClock(s.timeControl??'10+5');s.expires=s.chessClock.deadline();}
          }
          await playBotTurn(s,this.client.user!.id);
          if(s.chess&&s.chess.winner!==null) {await this.settleChess(s,s.chess.ending());return;}
        } else throw new UserError('操作が見つかりません。');
      } else {
        if(!s.players.includes(i.user.id))throw new UserError('対戦中のプレイヤーのみ操作できます。');
        if(action==='leave') {
          const confirmation=await i.followUp({...this.leaveCard(s,i.user.id),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
          if(confirmation)this.trackLeave(confirmation.id,p=>i.webhook.editMessage(confirmation.id,p));return;
        }
        if(action===`resign${i.user.id}`) {
          this.clearLeave(i.message.id);
          if(s.chess) {s.chess.lose(s.players.indexOf(i.user.id)===0?1:2,'投了');await this.settleChess(s,s.chess.ending());}
          else if(s.mines)await this.finish(s,'ゲームを終了しました。ポイントの変動はありません。',false,'warning');
          else if(s.board) { s.board.winner=(s.players.indexOf(i.user.id)===0?2:1) as Player; await this.settleBoard(s,'投了'); }
          else await this.finish(s,'参加者が対戦を終了しました。',s.escrow,'warning');
          return;
        }
        if(s.chess) {
          const {moved,botDeclined}=applyChessAction(s,action,i.user.id,this.client.user!.id,actionTime);
          if(botDeclined)await i.followUp({...card('引き分けの提案','Botは対局を続けます。','info'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
          if(s.chess.winner!==null) {await this.settleChess(s,s.chess.ending());return;}
          if(moved) {
            await playBotTurn(s,this.client.user!.id);
            if(s.chess.winner!==null) {await this.settleChess(s,s.chess.ending());return;}
          }
        } else if(s.mines) {
          const game=s.mines;
          if(action==='mode')game.mode=game.mode==='open'?'flag':'open';
          else if(/^row\d$/.test(action)) {
            const r=Number(action.slice(3));if(r>=game.size)throw new UserError('盤面内の行を選んでください。');game.selectedRow=r;
          } else if(/^cell\d$/.test(action)&&game.selectedRow!==undefined) {
            const c=Number(action.slice(4));
            if(game.mode==='flag')game.flag(game.selectedRow,c);else game.open(game.selectedRow,c);
            if(game.outcome) {await this.settleMines(s);return;}
          } else throw new UserError('行を選んでから、マスのボタンを押してください。');
        } else if(s.board) {
          if(s.players[s.board.turn-1]!==i.user.id)throw new UserError('今は相手の番です。');
          if(action==='next'||action==='prev') { s.page+=action==='next'?1:-1; }
          else if(s.board instanceof Othello&&action==='move'&&i.isStringSelectMenu()) { const [r,c]=i.values[0]!.split(',').map(Number);s.board.play(r!,c!);s.page=0; }
          else if(s.board instanceof Othello&&/^place\d+,\d+$/.test(action)) {const [r,c]=action.slice(5).split(',').map(Number);s.board.play(r!,c!);s.page=0;}
          else if(s.board instanceof ConnectFour&&/^col[0-6]$/.test(action))s.board.play(Number(action.slice(3)));
          else throw new UserError('置く場所を選んでください。');
          await playBotTurn(s,this.client.user!.id);
          if(s.board.winner!==null) {await this.settleBoard(s);return;}
        } else {
          if(s.hands[i.user.id])throw new UserError('すでに選択済みです。相手の選択を待ってください。');
          if(!(s.kind==='janken'?['rock','scissors','paper']:['high','low']).includes(action))throw new UserError('選択が無効です。');
          s.hands[i.user.id]=action;
          await playBotTurn(s,this.client.user!.id);
          if(s.players.every(p=>s.hands[p])) {await this.settleChoices(s);return;}
          await i.followUp({...card('選択しました','相手の選択を待っています。あなたの選択はまだ公開されません。','success'),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
        }
      }
      s.revision++;
      if(!s.chess&&!['size','clock','next','prev'].includes(action))s.expires=Date.now()+playingTimeout(s.kind);
      if(s.chessClock)s.expires=s.chessClock.deadline();
      await this.save(s);await this.redraw(s);
    }); await (['join','bot'].includes(action)?this.locked('recruiting',work):work()); } catch(e) { await i.followUp({...exceptionCard(e,`game:${action}`),flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral}); }
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
  private async settleChess(s:Session,reason:string) {
    const game=s.chess!,winner=game.winner!;
    const deltas:Record<string,bigint>={};
    const botId=this.client.user!.id,bot=s.players.includes(botId);
    const amounts=chessReward(game.engine.history().length,Boolean(reason==='投了'||reason==='時間切れ'),bot);
    for(const [index,p] of s.players.entries())if(p!==botId)deltas[p]=winner===0?amounts.draw:index===winner-1?amounts.win:amounts.lose;
    await this.store.reward(`settle:${s.id}`,deltas);
    await this.finish(s,`**${winner===0?'🤝 引き分け！':`🏆 <@${s.players[winner-1]}> の勝ち！`}**\n${reason}\n\n**ポイント変動**\n${Object.entries(deltas).map(([p,n])=>`<@${p}> · **${n>=0n?'+':''}${formatAmount(n)}pt**`).join('\n')}`,false,winner===0?'info':'success');
  }
  private async settleMines(s:Session) {
    const game=s.mines!,won=game.outcome==='won',amount=won?mineLevels[game.level].reward:0n;
    await this.store.reward(`settle:${s.id}`,{[s.host]:amount});
    await this.finish(s,won?`**🎉 全ての安全なマスを開きました！**\n<@${s.host}> · **+${formatAmount(amount)}pt**`:'**💣 地雷を踏んでしまいました。**\nポイントの変動はありません。',false,won?'success':'danger');
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
      result=`**${cardLabel(s.currentCard)} → ${cardLabel(next)}** · 正解は **${answer.toUpperCase()}**\n${s.players.map(p=>`<@${p}>: ${s.hands[p]!.toUpperCase()}`).join('\n')}\n${winners.length===1?`🏆 <@${winners[0]}> が **${formatAmount(BigInt(s.bet)*2n)}pt** 獲得！`:winners.length===2?'🤝 両者正解。賭け金を返金しました。':'💸 両者不正解。賭け金は没収です。'}`;
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
    if(s.phase==='playing'&&s.chess) {s.chess.lose(s.chess.turn,'時間切れ');await this.settleChess(s,s.chess.ending());}
    else if(s.phase==='playing'&&s.board) { s.board.winner=s.board.turn===1?2:1;await this.settleBoard(s,'時間切れ'); }
    else await this.finish(s,'時間切れで終了しました。',s.escrow,'warning');
  }
  async restore() {
    if(this.timer)clearInterval(this.timer);
    for(const r of await this.store.sessions()) {
      try {
        const s=JSON.parse(r.payload) as Session;
        s.board=undefined;
        s.chess=undefined;s.mines=undefined;
        await this.finish(s,'Botが再起動したため対戦を終了しました。',s.escrow,'warning');
      }catch(e){console.error(`対戦復旧失敗: ${e instanceof Error?e.message:'unknown'}`);}
    }
    this.timer=setInterval(()=>{
      for(const [key,replay] of this.replays)if(replay.expires<=Date.now())this.replays.delete(key);
      for(const s of this.sessions.values())if(s.expires<=Date.now())void this.locked(s.id,async()=>{if(this.sessions.has(s.id)&&s.expires<=Date.now())await this.expire(s);}).catch(e=>console.error(`期限処理: ${e instanceof Error?e.message:'unknown'}`));
    },1000);this.timer.unref();
  }
  async leave(userId: string) {
    const s=[...this.sessions.values()].find(s=>s.host===userId||s.players.includes(userId));
    if(!s)throw new UserError('参加中のゲームはありません。');
    return this.leaveCard(s,userId);
  }
  private leaveCard(s:Session,userId:string) {
    const expires=Date.now()+30_000;
    return card('ゲームを終了しますか？',s.phase==='recruiting'?(s.kind==='minesweeper'?'ゲームの開始を取り消します。':'募集を取り消します。'):s.board||s.chess?'投了すると **負け扱い** になります。':s.kind==='highlow'?'賭け金を **両者に返金** して終了します。':'ゲームを終了します。','warning',[row(button(this.id(s,`${s.phase==='recruiting'?'cancel':`resign${userId}`}~${expires}`),'はい、終了する',ButtonStyle.Danger),button(this.id(s,`keep${userId}~${expires}`),'いいえ、続ける',ButtonStyle.Secondary))],'確認は30秒以内');
  }
  async replay(i:ButtonInteraction) {
    const replay=this.replays.get(i.customId.slice('replay:'.length));
    if(!replay||replay.expires<=Date.now()||replay.channelId!==i.channelId)throw new UserError('このボタンは期限切れです。自分でゲームのコマンドを実行してください。');
    requireButtonOwner(replay.owner,i.user.id);
    await i.deferReply();
    return this.create(replay.kind,i.user.id,i.channelId,async p=>{await i.editReply(p);return i.fetchReply();},undefined,replay.size,BigInt(replay.bet),replay.size===6?'easy':replay.size===10?'hard':'normal',replay.timeControl);
  }
  async close() { if(this.timer)clearInterval(this.timer);for(const timer of this.leaveTimers.values())clearTimeout(timer);this.leaveTimers.clear();await Promise.allSettled(this.locks.values()); }
}
