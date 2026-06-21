<div align="center">
<h1>
  多機能ゲームBot (杉山啓太Bot)
  
  [![discord.py](https://img.shields.io/badge/discord.py-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discordpy.readthedocs.io/)
  [![Python 3.10](https://img.shields.io/badge/Python-3.10-yellow?style=flat-square&logo=python&logoColor=white)](https://www.python.org/downloads/release/python-3100/)
  [![License](https://img.shields.io/badge/LICENSE-AGPL3.0-green.svg?style=flat-square)](LICENSE)
</h1>
会話要約、画像生成・加工、そしてオセロや四目並べといったゲーム機能など  
詰めるだけ詰め込んだだけのBot!!!<br>
<br>


</div>

## なんのためにつくった...?

クソ暇だった2025年GW。  
暇なので自分が思いつく限り面白そーなコマンドやゲーム機能を入れたBotをPython1枚3000行で作成ww  
一応分割して今に至ります。全然管理はできてないので今でも自分では意味わからん構成してる助けて。  

**2025/06/14 やまかわてるき鯖へのBeta版導入。** 今でも使われてる。そして今でもBeta版。(現在2026/06/21)  

## 軽い説明

会話要約、画像生成・加工、そしてオセロや四目並べといったゲーム機能を提供します。  
色々コマンドはあるのでリスト参考にしてもらって遊んでみてください。  
**コマンドの実行は、許可されたチャンネル内でコマンド名と引数を入力するだけで行えます！！**  

## コマンドリスト

### ゲーム機能
*   `othello (@相手ユーザー)`:
    *   `othello`: オセロの対戦相手を募集します。盤面サイズ(6x6, 8x8, 10x10)を選択可能です。
    *   `othello @メンション`: 指定したユーザーと対戦します。
*   `connectfour (@相手ユーザー)` (または `cf`): 四目並べの対戦を開始します。
*   `janken`: じゃんけんゲームを開始します。リアクションで手を決定し、ポイントを賭けて勝負します。
*   `gamble`: 所持ポイントを賭けたハイリスク・ハイリターンなギャンブルを行います。
*   `bet [金額]`: ポイントを賭けてシンプルなダイスゲームを行います。
*   `login`: 1日1回、ログインボーナス（ポイント）を受け取ります。
*   `give [相手] [金額]`: 他のユーザーにポイントを送金します（手数料あり）。

*   `leave`: 進行中のゲームから投了・離脱します。
*   `point`: 現在のゲームポイントとランキングを表示します。

### 画像・メディア機能
*   `text [文字列]`: 指定スタイル（黄色・黒縁）でテキスト画像を生成します。末尾に `square` をつけると正方形スタンプ化します。
*   `text2 [文字列]`: 青色スタイルのテキスト画像を生成します。
*   `text3 [文字列]`: 赤色・明朝体スタイルのテキスト画像を生成します。
*   `text4 [文字列] square`: 特殊な変形を加えたテキスト画像を生成します（正方形のみ）。
*   `text5 [文字列] square`: 虹色グラデーションのテキスト画像を生成します（正方形のみ）。
*   `watermark`: 画像を添付して実行すると、ランダムなテンプレートを用いてウォーターマークを合成します。
*   `gaming`: 画像を添付して実行すると、ゲーミング風（七色に光る）GIFアニメーションに変換します。
*   `5000 [上文字列] [下文字列]`: 「5000兆円欲しい！」風のロゴ画像を生成します。
*   `voice [テキスト]`: VoiceVox APIを使用して、テキストを音声ファイル(WAV)に変換して送信します。

### ユーティリティ・その他
*   `/imakita`: (スラッシュコマンド) 過去30分のチャットログをAI (DeepSeek) が3行で要約します。
*   `tenki [都市名]`: 指定された日本の都市の天気予報を表示します。DeepSeekによる都市名の推測補完に対応しています。
*   `rate [金額] [通貨コード]`: 指定した外貨を現在のレートで日本円に換算します。
*   `time (国コード)`: 世界時計を表示します。コードなしの場合は日本時間を表示します。
*   `info (@ユーザー)`: ユーザーの詳細情報（ID、作成日、バッジ、ロール等）を表示します。
*   `totusi [文字列]`: 「突然の死」風のアスキーアートを生成します。
*   `ping`: Botの応答速度を表示します。
*   `setchannel` (管理者のみ): 現在のチャンネルでのBot利用を許可/禁止します。

## ディレクトリ構成

```text
.
├── main.py                 # 起動用スクリプト
├── bot.py                  # Bot本体の定義
├── .env                    # 環境変数 (APIキー等)
├── requirements.txt        # 依存ライブラリ一覧
├── assets/                 # アセットフォルダ
│   ├── fonts/              # フォントファイル (必須)
│   │   ├── MochiyPopOne-Regular.ttf
│   │   └── NotoSerifJP-Black.ttf
│   └── watermark_templates/ # ウォーターマーク用画像 (必須)
├── core/                   # 設定・定数・状態管理
├── cogs/                   # コマンド定義 (Economy, Games, Media, Utility, System)
├── data/                   # データ保存用 (自動生成されるJSONファイル等)
├── engines/                # ゲームロジック
├── services/               # AI・画像処理・ネットワーク機能
└── ui/                     # Discord UI (Embed, View)
```

## 導入手順

### ライブラリ
```bash
pip install -r requirements.txt
```

### 環境変数
```env
DISCORD_BOT_TOKEN=
DEEPSEEK_API_KEY=
VOICEVOX_API_KEY=
```
※rootに作成

## クレジット・使用API

*   **DeepSeek API:** チャット要約、地名推測など
*   **VoiceVox (Web API):** テキスト読み上げ
*   **つくもAPI:** 天気予報データ
*   **Exchange Rate API:** 為替レート
*   **5000兆円欲しい！API** 

## ライセンス

[AGPL-3.0](LICENSE)  
改変した後、ネットワーク経由でユーザーにサービスを提供する場合、ソースコードの公開義務が発生します。

---

© 2026 yexe