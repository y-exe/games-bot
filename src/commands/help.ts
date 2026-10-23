import {ButtonStyle,MessageFlags,type ButtonInteraction} from 'discord.js';
import {card,row,button} from '../ui/cards.js';
import {emoji} from '../ui/emojis.js';
import {commands} from './definitions.js';
import {rewards,othelloReward} from '../data/rewards.js';

export function commandListCard() {
  return card('杉山啓太Bot · 全コマンド一覧',commands.map(command=>`- \`${['help','imakita'].includes(command.name)?`/${command.name}`:command.name}\` · ${command.description}`).join('\n')+'\n-# `/help` と `/imakita` だけスラッシュ対応。他はチャットへの直接入力で使い、日本語の別名にも対応しています。','info',[row(button('help:home','カテゴリに戻る',ButtonStyle.Secondary,emoji('status_info')))]);
}
export function help(category='home') {
  if(category==='all')return commandListCard();
  const content:Record<string,string>={
    home:'**遊ぶ** · オセロ / 四目並べ / チェス / マインスイーパー / じゃんけん / ハイロー\n対戦相手を募集したり、Botと練習できます。\n\n**ポイント** · ログインボーナス / ランキング / 送金 / ギャンブル\n**作る・調べる** · 文字画像 / 画像加工 / 音声 / 天気 / 時計 / 会話要約\n\n下のカテゴリから使い方を選んでください。\n-# コマンドはチャットに直接入力します。`/help` と `/imakita` だけスラッシュでも使えます。\n-# コマンドだけ入力すると、文字やファイルを入力できるフォームが開きます。',
    games:`**対戦でポイントを稼ぐ**\n- \`othello (@相手)\` · 勝利 **${othelloReward(6,0).win}〜${othelloReward(10,100).win}pt**\n-# 6マス: 120＋石差×2 / 8マス: 150＋石差×3 / 10マス: 210＋石差×5\n-# 引分30〜50pt · 敗北−30〜−45pt · 投了での勝利は90〜650pt\n- \`connectfour (@相手)\` · 勝利 **+${rewards.connectfour.win}pt** / 引分 **+${rewards.connectfour.draw}pt** / 敗北 **${rewards.connectfour.lose}pt**\n- \`janken (@相手)\` · 勝利 **+${rewards.janken.win}pt** / 引分 **+${rewards.janken.draw}pt** / 敗北 **${rewards.janken.lose}pt**\n- \`highlow 賭け金 (@相手)\` · 単独正解で賭け金の **2倍**を受取\n-# 両者正解は返金、両者不正解は没収\n- \`leave\` · 確認して対戦を終了\n\n**対戦の操作**\n盤面の数字・文字と同じボタンで石やコマを置きます。\n相手を省略すると自由募集。オセロ・四目並べ・チェス・じゃんけんは募集者が **Botと対戦** も選べます。マインスイーパーはひとり用です。\n-# オセロの指名対戦は、指名された相手のみ参加できます。\n-# 盤面の手番は3分 · じゃんけん・ハイローの選択は60秒\n-# Bot対戦は基礎値で精算（6マス: 80＋石差 / じゃんけん勝利+25 など）\n-# チャンネル停止中も leave で対戦終了を確認できます。`,
    economy:'**ポイントを使う**\n- `login` · **30〜150pt / 日**。連続日数と順位で加算\n- `point` · 自分の残高とランキング\n- `give @相手 金額` · 手数料15%で送金\n- `bet 金額` · 増減は賭け金の **−100%〜＋100%**\n- `gamble` · 賭け金・倍率を抽選。変動は賭け金の **−11倍〜＋9倍**\n-# Bet・ギャンブルは賭け金の固定上限なし。負けるとポイントが減ります。\n\n**毎日の受取**\nログインは **毎日0時（日本時間）** に切替。\n**今後のログボ** ボタンで予測を確認できます。\n-# ポイントはこのBot内のゲーム用です。',
    media:'**文字画像**\n- `text 文字` · 黄の縁取り / `text2 文字` · 青 / `text3 文字` · 赤の明朝体\n- `text4 文字 square` · 変形スタンプ / `text5 文字 square` · 虹色スタンプ\n-# text〜text3: コンマで改行 · squareで正方形スタンプ\n\n**画像加工・音声**\n- `watermark` ＋画像 · 端末テンプレートを合成\n- `gaming` ＋画像 · 七色に光るGIF\n- `5000 上 下` · 5000兆円風の画像\n- `voice 文字` · VOICEVOX読み上げ＋ボイチェン\n-# `voice` ＋添付音声でも変換（45秒・10MB以下）\n-# voiceは指定サーバーで利用できます。',
    utility:'**便利機能**\n- `/imakita (minutes: 10・30・60)` · 選んだ範囲の会話を3行で要約。カードで範囲・時間帯別詳細を切替\n- `tenki 地名` · 3日分の天気\n- `rate 金額 通貨` · 円換算\n- `time 国コード` · 世界時計\n- `info (@相手)` · プロフィール・バッジ\n- `totusi 文字列` · 突然の死\n- `ping` · 接続状況\n\n**管理**\n- `setchannel` · 利用チャンネルの切替（管理者）\n- `sync` · スラッシュコマンドの同期（Bot所有者・管理者）\n-# tenki・time・rate のカードはボタンで都市や通貨を切替。',
  };
  content.games=`**チェス**\n- \`chess (@相手)\` / \`チェス\` · 自由募集・指名対戦・**Botと対戦** に対応\n-# 座標ボタンで **①駒 → ②移動先** を選択。青いマスは選択中、緑のマスは移動先、赤いマスは駒取り・チェック。昇格は4種類から選べます。\n-# キャスリング・アンパッサン・チェックメイト・引き分け判定に対応\n-# 募集時に持ち時間を選択（既定10分＋1手5秒）。駒選択・昇格待ちも時計は進みます。\n-# 12半手以上: 勝利+300pt / 敗北−60pt / 引分+50pt。投了・時間切れの勝利+180pt。12半手未満は変動なし。\n-# Bot戦: 勝利+200pt / 敗北−40pt / 引分+30pt。投了・時間切れの勝利+120pt。3回反復・50手は申告、5回反復・75手は自動判定。引分提案にも対応。\n\n**マインスイーパー**\n- \`minesweeper (easy・normal・hard)\` / \`マインスイーパー\`\n-# 難易度を省略するとボタンで選択。初級6×6・6個 / 中級8×8・10個 / 上級10×10・20個\n-# **行 → マス** のボタンで開き、旗モードで旗を立て外し。初手と周囲は安全。\n-# 開いた数字を再び押すと、旗の数が一致した場合に周囲を開きます。誤った旗には注意。\n-# 全ての安全なマスを開くとクリア。初級+60pt / 中級+120pt / 上級+220pt。失敗・中断は変動なし。\n-# 最終操作から10分で終了。\n\n`+content.games;
  const categories=[['home','トップ','🏠'],['games','ゲーム','🎮'],['economy','ポイント','🪙'],['media','画像・音声','🎨'],['utility','便利・管理','🛠️']] as const;
  return card('杉山啓太Bot · 使い方',content[category]??content.home!,'info',[row(...categories.map(([key,label,icon])=>button(`help:${key}`,label,category===key?ButtonStyle.Primary:ButtonStyle.Secondary,icon,category===key))),row(button('help:all','コマンド一覧を表示',ButtonStyle.Primary,'📋'))]);
}
export async function handleHelp(i:ButtonInteraction){
  const payload=help(i.customId.split(':')[1]);
  if(i.message.flags.has(MessageFlags.Ephemeral)){await i.deferUpdate();await i.editReply(payload);}
  else await i.reply({...payload,flags:MessageFlags.IsComponentsV2|MessageFlags.Ephemeral});
}
