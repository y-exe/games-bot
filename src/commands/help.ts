import {ButtonBuilder,ButtonStyle,MessageFlags,type ButtonInteraction} from 'discord.js';
import {card,row,button} from '../ui/cards.js';
import {emoji} from '../ui/emojis.js';
import {commands} from './definitions.js';
import {rewards,botRewards,othelloReward,chessReward} from '../data/rewards.js';
import {mineLevels} from '../games/minesweeper.js';
import {requireButtonOwner} from './button-owner.js';
import {trackInteractionButtons} from '../ui/button-expiry.js';

const docsPages:Record<string,{label:string;path:string}>={
  home:{label:'Docsを開く',path:'README.md'},
  games:{label:'詳しいルール・操作',path:'guide/games.md'},
  economy:{label:'ポイントの使い方',path:'guide/points.md'},
  media:{label:'画像・音声の使い方',path:'guide/media.md'},
  utility:{label:'便利機能の使い方',path:'guide/utility.md'},
};
function docsLink(label:string,path:string) {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(`https://github.com/y-exe/games-bot/blob/main/docs/${path}`);
}
function docsButton(category:string) {
  const page=docsPages[category]??docsPages.home!;
  return docsLink(page.label,page.path);
}
function gameHelpText() {
  const games=[
    ['オセロ','othello (@相手)','6・8・10マスを選択。盤面の数字・英字と同じボタンで石を置きます。',`勝利 ${othelloReward(6,0).win}〜${othelloReward(10,100).win}pt · Bot戦は報酬控えめ`],
    ['四目並べ','connectfour (@相手)','列のボタンで石を落とし、縦・横・斜めに4個並べます。',`勝利 +${rewards.connectfour.win}pt · Bot戦 +${botRewards.connectfour.win}pt`],
    ['チェス','chess (@相手)','駒 → 移動先の順に選択。持ち時間は募集時に選べます。',`勝利 +${chessReward(12).win}pt · Bot戦 +${chessReward(12,false,true).win}pt（12半手未満は変動なし）`],
    ['マインスイーパー','minesweeper','難易度を選び、行 → マスの順に開きます。旗で地雷をマーク。',`クリア 初級+${mineLevels.easy.reward}pt / 中級+${mineLevels.normal.reward}pt / 上級+${mineLevels.hard.reward}pt · 失敗は減点なし`],
    ['じゃんけん','janken (@相手)','グー・チョキ・パーを選択。相手の手は結果まで非公開です。',`勝利 +${rewards.janken.win}pt · Bot戦 +${botRewards.janken.win}pt`],
    ['ハイロー','highlow 賭け金 (@相手)','次のカードが大きいか小さいかを選択。人同士の対戦です。','単独正解で賭け金の2倍を受取 · 両者正解は返金、両者不正解は没収'],
  ];
  return games.map(([name,command,operation,reward])=>`**${name}** · \`${command}\`\n-# ${operation}\n-# ${reward}`).join('\n\n')
    +'\n\n相手を省略すると自由募集。ハイロー以外の対戦ゲームは **Botと対戦** も選べます。\n-# オセロ・四目並べは1手3分、じゃんけん・ハイローは60秒。\n-# `leave` または終了ボタンで終了を確認できます。';
}

export function commandListCard(ownerId?:string) {
  return card('杉山啓太Bot · 全コマンド一覧',commands.map(command=>`- \`${['help','imakita'].includes(command.name)?`/${command.name}`:command.name}\` · ${command.description}`).join('\n')+'\n-# `/help` と `/imakita` だけスラッシュ対応。他はチャットへの直接入力で使い、日本語の別名にも対応しています。','info',[row(button(`help:home:${ownerId??''}`,'カテゴリに戻る',ButtonStyle.Secondary,emoji('status_info')))],undefined,undefined,undefined,undefined,{bodyRows:[row(docsButton('home'))]});
}
export function help(category='home',ownerId?:string) {
  if(category==='all')return commandListCard(ownerId);
  const content:Record<string,string>={
    home:'**遊ぶ** · オセロ / 四目並べ / チェス / マインスイーパー / じゃんけん / ハイロー\n対戦相手を募集したり、Botと練習できます。\n\n**ポイント** · ログインボーナス / ランキング / 送金 / ギャンブル\n**作る・調べる** · 文字画像 / 画像加工 / 音声 / 天気 / 時計 / 会話要約\n\n下のカテゴリから使い方を選んでください。\n-# コマンドはチャットに直接入力します。`/help` と `/imakita` だけスラッシュでも使えます。\n-# コマンドだけ入力すると、文字やファイルを入力できるフォームが開きます。',
    games:gameHelpText(),
    economy:'**ポイントを使う**\n- `login` · 通常 **30〜150pt / 日**。連続5日目+50pt・10日目+100pt\n- `point` · 自分の残高とランキング\n- `give @相手 金額` · 手数料15%で送金\n- `bet 金額` · 増減は賭け金の **−100%〜＋100%**\n- `gamble` · 賭け金・倍率を抽選。変動は賭け金の **−11倍〜＋9倍**\n-# Bet・ギャンブルは賭け金の固定上限なし。負けるとポイントが減ります。\n\n**毎日のポイント**\nログインは **毎日0時（日本時間）** に切替。\n**今後のログボ** ボタンで予測を確認できます。\n**ログボを受け取ると翌日0時の徴収が免除。** 未受取なら1万ptから累進徴収。136万超の部分は5%、178万超の部分は6%。\n-# ポイントはこのBot内のゲーム用です。',
    media:'**文字画像**\n- `text` · 種類を選んで生成 / `textc` · カスタム編集・テンプレート保存・共有\n- `text1 文字` · 黄の縁取り / `text2 文字` · 青 / `text3 文字` · 赤の明朝体\n- `text4 文字 square` · 変形スタンプ / `text5 文字 square` · 虹色スタンプ\n-# text1〜text3: コンマで改行 · squareで正方形スタンプ\n\n**画像加工・音声**\n- `watermark` ＋画像 · 端末テンプレートを合成\n- `gaming` ＋画像 · 七色に光るGIF\n- `5000 上 下` · 5000兆円風の画像\n- `voice 文字` · VOICEVOX読み上げ＋ボイチェン\n-# `voice` ＋添付音声でも変換（45秒・10MB以下）\n-# voiceは指定サーバーで利用できます。',
    utility:'**便利機能**\n- `/imakita (minutes: 10・30・60)` · 選んだ範囲の会話を3行で要約。カードで範囲・時間帯別詳細を切替\n- `tenki 地名` · 3日分の天気\n- `rate 金額 通貨` · 円換算\n- `time 国コード` · 世界時計\n- `info (@相手)` · プロフィール・バッジ\n- `totusi 文字列` · 突然の死\n- `ping` · 接続状況\n\n**管理**\n- `setchannel` · 利用チャンネルの切替（管理者）\n- `sync` · スラッシュコマンドの同期（Bot所有者・管理者）\n-# tenki・time・rate のカードはボタンで都市や通貨を切替。',
  };
  const categories=[['home','トップ','🏠'],['games','ゲーム','🎮'],['economy','ポイント','🪙'],['media','画像・音声','🎨'],['utility','便利・管理','🛠️']] as const;
  const selected=Object.hasOwn(content,category)?category:'home';
  return card('杉山啓太Bot · 使い方',content[selected]!,'info',[
    row(...categories.map(([key,label,icon])=>button(`help:${key}:${ownerId??''}`,label,selected===key?ButtonStyle.Primary:ButtonStyle.Secondary,icon,selected===key))),
    row(button(`help:all:${ownerId??''}`,'コマンド一覧',ButtonStyle.Success,'📋')),
  ],undefined,undefined,undefined,undefined,{bodyRows:[row(docsButton(selected),
    ...(selected==='games'?[docsLink('報酬の一覧','guide/points.md')]:selected==='utility'?[docsLink('バッジについて','guide/badges.md')]:[]))]});
}
export async function handleHelp(i:ButtonInteraction){
  const [,category,ownerId]=i.customId.split(':');
  requireButtonOwner(ownerId,i.user.id);
  await i.deferUpdate();
  const message=await i.editReply(help(category,ownerId));
  trackInteractionButtons(i,message);
}
