# セットアップ

[目次](../README.md) · [運用](maintenance.md)

## 必要なもの

- Bun **1.3.14以上**。本番DBはPostgreSQL、ローカルDBはPGlite。
- DiscordのテストBotとテストサーバー。
- 音声を使う場合はFFmpeg・ffprobe。RVC変換にはPython環境とモデルも必要。

## Discordの準備

1. Developer PortalでBotを作成し、**Server Members Intent** と **Message Content Intent** を有効にする。
2. `bot`・`applications.commands` スコープでテストサーバーへ招待する。
3. 利用先で「チャンネルを見る」「メッセージを送信」「メッセージ履歴を読む」「ファイルを添付」「埋め込みリンク」の権限を付ける。

## ローカルで起動

`.env.example` を **`.env.local`** にコピーし、次の項目を自分のテスト環境に合わせます。

| 変数 | 内容 |
| --- | --- |
| `DISCORD_BOT_TOKEN` | テストBotのトークン |
| `DISCORD_APPLICATION_ID` | 同じBotのアプリケーションID |
| `TEST_GUILD_ID` | テストサーバーID。ローカルではこのサーバーだけ受け付ける |
| `TEST_CHANNEL_ID` | 最初に使うテストチャンネルID。下の登録手順で使用 |
| `BOT_OWNER_ID` | Bot所有者のユーザーID |
| `DATA_DIR` | 保存先。既定 `.local` |
| `DATABASE_URL` | ローカルPGliteを使う場合は空欄 |

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run commands
```

`commands` はDiscordの登録内容を更新します。テストサーバーへ `/help`・`/imakita` を登録し、そのBotの古いグローバルコマンドを削除します。

絵文字は起動時に自動登録され、`DATA_DIR/emojis.json` に対応表が保存されます。登録済みの同じ素材は再利用するため、再起動しても増えません。対応表を失ってもDiscordの登録済み絵文字から復旧します。ローカル・本番とも同じ仕組みで、手動の絵文字登録は不要です。

## 最初の利用チャンネルを登録

現在、チャットコマンドは許可済みチャンネルでのみ受け付けます。空のDBを使う場合は、Botを停止した状態で次を実行し、`.env.local` の `TEST_CHANNEL_ID` を登録してください。登録済みなら変更しません。

```sh
bun --no-env-file -e '
import {settings} from "./src/config.ts";
import {Store} from "./src/data/store.ts";
if(settings.production || !/^\d{17,20}$/.test(settings.testChannelId)) throw new Error("ローカルのTEST_CHANNEL_IDを確認してください");
const store=new Store();
try {
  await store.initialize();
  if(!(await store.allowedChannels()).has(settings.testChannelId)) await store.toggleChannel(settings.testChannelId);
} finally { await store.close(); }
'
bun run dev
```

この登録処理は選択中のDBへ書き込みます。ローカルPGliteで試す場合は `DATABASE_URL` を空欄にしてください。
`setchannel` は現在のチャンネルを停止する操作に使えます。停止後の再開や別チャンネルの追加は、上の登録手順で対象のIDを指定します。

## 追加機能の設定

| 変数 | 用途 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 会話要約・地名推測 |
| `VOICEVOX_API_KEY` | テキスト読み上げ |
| `VOICE_GUILD_IDS` | voiceを使えるサーバーID。カンマ区切り。ローカルの既定はテストサーバー |
| `ERROR_LOG_CHANNEL_ID` | 調査用エラーカードの投稿先 |
| `RVC_PYTHON`・`RVC_ROOT`・`RVC_ASSETS` | RVCのPython・ソース・モデルの配置先 |
| `FFPROBE_PATH` | ffprobeのパス。既定 `ffprobe` |

WindowsのRVCは `.local/rvc` にソース、`.local/rvc-assets` に `ymkw.pth`・`hubert_base.pt` を用意し、`scripts/setup-rvc.ps1` で依存環境を準備します。モデルはリポジトリに同梱していません。

本番は **起動前の環境変数で `BOT_ENV=production`** を指定すると `.env` を読みます。本番では `DATABASE_URL` が必須です。ローカル用の `.env.local` とトークン・DBを分けてください。
