import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const basic=(name:string,description:string)=>new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);
export const commands = [
  basic('help','ゲーム・画像・便利機能の使い方を開く'),
  basic('othello','オセロの対戦相手を募集する').addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略すると誰でも参加）')).addIntegerOption(o=>o.setName('size').setDescription('盤面の大きさ').addChoices({name:'6 × 6',value:6},{name:'8 × 8',value:8},{name:'10 × 10',value:10})),
  basic('connectfour','四目並べの対戦相手を募集する').addUserOption(o=>o.setName('opponent').setDescription('対戦相手')),
  basic('janken','手を非公開で選ぶじゃんけん対戦を募集する').addUserOption(o=>o.setName('opponent').setDescription('対戦相手')),
  basic('highlow','次のカードの大小を予想して対戦する').addStringOption(o=>o.setName('amount').setDescription('一人あたりの賭け金（ポイント）').setRequired(true).setAutocomplete(true)).addUserOption(o=>o.setName('opponent').setDescription('対戦相手')),
  basic('leave','参加中の対戦を終了する確認を開く'),
  basic('point','自分のポイントとランキングを見る'),
  basic('login','今日のログインボーナスを受け取る'),
  basic('bet','サイコロでポイントを賭ける').addStringOption(o=>o.setName('amount').setDescription('賭け金').setRequired(true).setAutocomplete(true)),
  basic('gamble','ハイリスクギャンブルの確認を開く'),
  basic('give','手数料15%でポイントを送金する').addUserOption(o=>o.setName('user').setDescription('送金先').setRequired(true)).addStringOption(o=>o.setName('amount').setDescription('送金額').setRequired(true).setAutocomplete(true)),
  ...['text','text2','text3','text4','text5'].map((name,i)=>basic(name,['黄色の縁取り文字画像','青色の縁取り文字画像','赤色の明朝体文字画像','変形した文字スタンプ','虹色の文字スタンプ'][i]!).addStringOption(o=>o.setName('text').setDescription('画像にする文字（コンマで改行）').setRequired(true).setMaxLength(200)).addBooleanOption(o=>o.setName('square').setDescription('正方形スタンプにする'))),
  ...['watermark','gaming'].map(name=>basic(name,name==='gaming'?'画像を七色に光るGIFにする':'画像に端末などのテンプレートを合成する').addAttachmentOption(o=>o.setName('image').setDescription('加工する画像').setRequired(true))),
  basic('5000','5000兆円欲しい風の文字画像').addStringOption(o=>o.setName('top').setDescription('上の文字').setRequired(true)).addStringOption(o=>o.setName('bottom').setDescription('下の文字').setRequired(true)).addBooleanOption(o=>o.setName('hoshii').setDescription('欲しい！を追加する')).addBooleanOption(o=>o.setName('rainbow').setDescription('虹色にする')),
  basic('voice','VOICEVOX読み上げ・やまかわボイチェン').addStringOption(o=>o.setName('text').setDescription('読み上げるテキスト').setMaxLength(200)).addAttachmentOption(o=>o.setName('audio').setDescription('変換する45秒以内の音声')).addBooleanOption(o=>o.setName('convert').setDescription('やまかわボイチェンを使う（既定: 有効）')),
  basic('imakita','直近30分の会話を3行で要約する'),
  basic('tenki','日本の都市の天気予報を見る').addStringOption(o=>o.setName('city').setDescription('都市名').setRequired(true).setAutocomplete(true)),
  basic('rate','外貨を日本円に換算する').addNumberOption(o=>o.setName('amount').setDescription('外貨の金額').setRequired(true)).addStringOption(o=>o.setName('currency').setDescription('通貨コード（USDなど）').setRequired(true).setMinLength(3).setMaxLength(3).setAutocomplete(true)),
  basic('time','日本や世界の現在時刻を見る').addStringOption(o=>o.setName('country').setDescription('JP・US・GBなどの国コード').setMaxLength(2).setAutocomplete(true)),
  basic('info','ユーザーのプロフィール・バッジを見る').addUserOption(o=>o.setName('user').setDescription('表示するユーザー')),
  basic('totusi','突然の死のアスキーアートを作る').addStringOption(o=>o.setName('text').setDescription('中央に表示する文字').setRequired(true).setMaxLength(150)),
  basic('ping','Botの接続状況を見る'),
  basic('setchannel','このチャンネルでのBot利用を切り替える').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  basic('sync','このサーバーへスラッシュコマンドを同期する').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o=>o.setName('guild_id').setDescription('同期先サーバーID（省略: 現在のサーバー）')),
  basic('embed','Components v2のカードを作成・編集する').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(s=>s.setName('create').setDescription('プレビューで確認してから投稿する').addStringOption(o=>o.setName('title').setDescription('タイトル').setMaxLength(100)).addStringOption(o=>o.setName('body').setDescription('本文').setMaxLength(3000)))
    .addSubcommand(s=>s.setName('edit').setDescription('このBotが投稿した編集用カードを編集する').addStringOption(o=>o.setName('message_id').setDescription('メッセージID').setRequired(true).setAutocomplete(true))),
];
export const slashCommands = commands.filter(command=>['help','imakita'].includes(command.name));
export const commandNames = new Set(commands.map(c=>c.name));
export const aliases: Record<string,string> = {
  おせろ:'othello','4moku':'connectfour','4nara':'connectfour',よんもく:'connectfour','4目並べ':'connectfour',へるぷ:'help',ヘルプ:'help',weather:'tenki',テンキ:'tenki',
  cf:'connectfour',四目並べ:'connectfour',オセロ:'othello',じゃんけん:'janken',ジャンケン:'janken',hl:'highlow',ハイロー:'highlow',
  points:'point',ポイント:'point',bonus:'login',daily:'login',ログイン:'login',ログボ:'login',pay:'give',送金:'give',ギャンブル:'gamble',賭け:'bet',かけ:'bet',ベッド:'bet',べっど:'bet',
  退出:'leave',たいしゅつ:'leave',レート:'rate',れーと:'rate',為替:'rate',天気:'tenki',てんき:'tenki',突然の死:'totusi',とつし:'totusi',突死:'totusi',詳細:'info',いんふぉ:'info',時間:'time',たいむ:'time',タイム:'time',じかん:'time',ピング:'ping',接続速度:'ping',ぴんぐ:'ping',
  テキスト:'text',テキスト2:'text2',テキスト3:'text3',テキスト4:'text4',テキスト5:'text5',ウォーターマーク:'watermark',うぉーたーまーく:'watermark',ゲーミング:'gaming',げーみんぐ:'gaming',ボイス:'voice',ぼいす:'voice',ボイチェン:'voice','5000兆円':'5000',
};
