import { Client, Events, GatewayIntentBits, MessageFlags, ActivityType, type Interaction, type Message } from 'discord.js';
import { settings, requireToken } from './config.js';
import { loadEmojis } from './ui/emojis.js';
import { card, disabledRawComponents } from './ui/cards.js';
import { Store } from './data/store.js';
import { Games, type GameKind } from './games/manager.js';
import { Economy } from './commands/economy.js';
import { Editor } from './commands/editor.js';
import { Context, positiveAmount } from './commands/context.js';
import { commandNames } from './commands/definitions.js';
import {parseLegacy} from './commands/legacy.js';
import { utility, handleHelp, handleSummary,handleTimeHelp,handleTimeSwitch,handleTenkiSwitch,handleRateSwitch } from './commands/utility.js';
import { media } from './commands/media.js';
import { MediaWorker } from './services/media.js';
import { taxScheduler } from './services/tax.js';
import {CommandCooldowns,channelAllowsCommand,channelAllowsComponent,expiredInteraction} from './commands/policy.js';
import {handleAutocomplete} from './commands/autocomplete.js';
import {exceptionCard,replyWithError,setErrorChannels} from './ui/errors.js';
import { UserError, redact, errorReport } from './errors.js';
import { authorizeChannel } from './commands/delivery.js';
import { promptSpecs, promptCard, needsPrompt, buildModal, handlePromptSubmit, openPrompt } from './commands/prompts.js';

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});
if(settings.production&&!settings.databaseUrl)throw new UserError('本番起動にはDATABASE_URLが必要です。');
const store=new Store();
try{await store.initialize();}catch(error){const report=errorReport(error,'database startup');await store.close();throw new UserError(`データベースの初期化に失敗しました。エラーID: ${report.id}`);}
loadEmojis();const allowed=await store.allowedChannels();setErrorChannels(allowed);
const games=new Games(client,store);const economy=new Economy(store,()=>client.user!.id);const editor=new Editor(client);const worker=new MediaWorker();
const gameNames=new Set(['othello','connectfour','janken','highlow']);const economyNames=new Set(['point','login','give','bet','gamble']);const mediaNames=new Set(['text','text2','text3','text4','text5','watermark','gaming','5000','voice']);
const cooldowns=new CommandCooldowns();
async function execute(name:string,ctx:Context) {
  if(!ctx.guild)return;
  if(!settings.production&&ctx.guild.id!==settings.guildId)return;
  if(!await authorizeChannel(name,ctx,allowed))return;
  cooldowns.take(ctx.user.id,name);
  if(!ctx.slash&&needsPrompt(name,ctx))return ctx.send(promptCard(name));
  await ctx.prepare(name==='embed'||name==='leave'||name==='imakita'||name==='sync');
  if(gameNames.has(name)) {
    const target=await ctx.target('opponent',name==='highlow'?1:0);if(target?.bot&&target.id!==client.user!.id)throw new UserError('他のBotを対戦相手に指定できません。');
    if(name==='highlow'&&target?.bot)throw new UserError('ハイローは人同士で対戦してください。Botは指名できません。');
    return games.create(name as GameKind,ctx.user.id,ctx.channelId,p=>ctx.send(p),target?.id,ctx.slash?.options.getInteger('size')??8,name==='highlow'?positiveAmount(ctx.text('amount')):0n);
  }
  if(name==='leave'){
    if(!ctx.slash&&!allowed.has(ctx.channelId))return ctx.send(card('対戦終了の確認','対戦しているチャンネルで `leave` を実行してください。\n元のゲーム画面の **投了する** ボタンからも確認できます。'));
    const message=await ctx.send(await games.leave(ctx.user.id));games.trackLeave(message.id,p=>ctx.send(p));return message;
  }
  if(economyNames.has(name))return economy.run(name,ctx);
  if(mediaNames.has(name))return media(name,ctx,worker);
  if(name==='embed')return editor.open(ctx);
  return utility(name,ctx,store,allowed);
}
async function interaction(i:Interaction) {
  if(i.isAutocomplete()) {
    if(!i.inCachedGuild()||(!settings.production&&i.guildId!==settings.guildId))return void i.respond([]).catch(()=>{});
    try {await handleAutocomplete(i,channelId=>editor.recentEditorCards(channelId));}
    catch {await i.respond([]).catch(()=>{});}
    return;
  }
  if(!i.guildId&&i.isButton()&&i.message.author.id===client.user?.id) {
    try {
      if(i.customId.startsWith('help:'))await handleHelp(i);
      else if(i.customId==='time:help')await handleTimeHelp(i);
      else throw new UserError('この操作はサーバー内で行ってください。');
    }catch(error){try{await replyWithError(i,error);}catch{console.error('DMの操作エラーを通知できませんでした。');}}
    return;
  }
  if(!i.inCachedGuild()||(!settings.production&&i.guildId!==settings.guildId))return;
  try {
    if(i.isChatInputCommand())await execute(i.commandName,new Context(i,client));
    else if(i.isButton()||i.isStringSelectMenu()) {
      if(!channelAllowsComponent(i.customId,i.channelId,allowed))throw new UserError('このチャンネルではBot利用が**停止されています。**\n管理者が `setchannel` で再開できます。');
      if(expiredInteraction(i.customId,Date.now()-(i.message.editedTimestamp??i.message.createdTimestamp))) {
        await i.message.edit({components:disabledRawComponents(i.message.components)}).catch(()=>{});
        throw new UserError('このカードのボタンは5分で無効になりました。\n-# もう一度コマンドを実行してください。');
      }
      if(i.customId.startsWith('game:'))await games.handle(i);
      else if(i.isButton()&&i.customId.startsWith('replay:'))await games.replay(i);
      else if(i.isButton()&&i.customId.startsWith('eco:'))await economy.handle(i);
      else if(i.isButton()&&i.customId.startsWith('help:'))await handleHelp(i);
      else if(i.isButton()&&i.customId==='time:help')await handleTimeHelp(i);
      else if(i.isButton()&&i.customId.startsWith('time:'))await handleTimeSwitch(i);
      else if(i.isButton()&&i.customId.startsWith('tenki:'))await handleTenkiSwitch(i);
      else if(i.isButton()&&i.customId.startsWith('rate:'))await handleRateSwitch(i);
      else if(i.isButton()&&i.customId.startsWith('summary:'))await handleSummary(i);
      else if(i.isButton()&&i.customId.startsWith('editor:'))await editor.handle(i);
      else if(i.isButton()&&i.customId.startsWith('again:')) {
        const [,kind,amount]=i.customId.split(':');
        if(!['bet','gamble'].includes(kind??''))throw new UserError('この操作は期限切れです。コマンドを開き直してください。');
        cooldowns.take(i.user.id,kind!);
        await economy.run(kind as 'bet'|'gamble',new Context(i,client,kind==='bet'?[amount??'']:[]));
      }
      else if(i.isButton()&&i.customId.startsWith('prompt:'))await openPrompt(i);
      else throw new UserError('この操作は期限切れです。コマンドを開き直してください。');
    } else if(i.isModalSubmit()&&i.customId.startsWith('prompt:'))await handlePromptSubmit(i,{client,allowed,execute});
    else if(i.isModalSubmit()&&i.customId.startsWith('editor:'))await editor.handle(i);
  }catch(e){
    try {await replyWithError(i,e);}
    catch {console.error('エラー通知を送信できませんでした。');}
  }
}
async function legacy(message:Message) {
  if(message.author.bot||!message.guild)return;
  if(!settings.production&&message.guild.id!==settings.guildId)return;
  let ctx=new Context(message,client);
  if(!allowed.has(message.channelId))ctx.makePrivate();
  try {
    const parsed=parseLegacy(message.content);if(!parsed)return;
    ctx=new Context(message,client,parsed.args);await execute(parsed.name,ctx);
  }catch(e){try{await ctx.fail(exceptionCard(e,'legacy command'),!(e instanceof UserError));}catch{console.error('本人へのコマンドエラー通知を送信できませんでした。');}}
}
let stopTax:(()=>void)|undefined;
client.once(Events.ClientReady,async ready=>{
  if(ready.user.id!==settings.applicationId){console.error('トークンとアプリケーションIDが一致しません。');client.destroy();await store.close();process.exitCode=1;return;}
  ready.user.setActivity('help / ゲーム・画像・ポイント',{type:ActivityType.Watching});
  await games.restore();stopTax=taxScheduler(store,()=>ready.user.id);console.log(`READY ${ready.user.tag} · ${settings.production?'production':'local'} · ${commandNames.size} commands · allowed channels ${allowed.size}`);
});
client.on(Events.InteractionCreate,i=>void interaction(i));client.on(Events.MessageCreate,m=>void legacy(m));
client.on(Events.Error,e=>console.error(`Discord接続: ${redact(e.message)}`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;stopTax?.();economy.close();await games.close();await worker.close();client.destroy();await store.close();}
const fatal=(error:unknown,operation:string)=>{errorReport(error,operation);process.exitCode=1;void stop().catch(e=>console.error(redact(e instanceof Error?e.message:'終了処理失敗')));};
process.on('unhandledRejection',error=>fatal(error,'unhandledRejection'));
process.on('uncaughtException',error=>fatal(error,'uncaughtException'));
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try{await client.login(requireToken());}catch(e){console.error(redact(e instanceof Error?e.message:'ログインに失敗しました。'));await stop();process.exitCode=1;}
