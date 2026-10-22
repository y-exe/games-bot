# 運用・エラー調査

[目次](../README.md) · [セットアップ](setup.md)

## コンテナでローカル検証

[初回セットアップ](setup.md)で `.env.local` と絵文字データを準備してから実行します。Composeは `.local/emojis.json` と `.local/emoji-originals` を読み取り用にマウントします。

```sh
docker compose up --build
docker compose logs --tail 100 games-bot
docker compose down
```

Botのデータは `games-bot-test-data` ボリュームに残ります。通常の停止では `--volumes` を付けないでください。
標準の `runtime` イメージはRVC環境を含みません。RVCを使う環境は `with-rvc` ターゲットとモデルの配置が必要です。

## データを守る

| 保存先 | 内容・バックアップ |
| --- | --- |
| ローカル `DATA_DIR/pglite` | Botを停止してディレクトリ全体をコピー |
| 本番PostgreSQL | DBのバックアップ・復元手順で保管 |
| `DATA_DIR/emojis.json`・`emoji-originals` | 絵文字の対応表・元画像 |
| RVCのモデル配置先 | 音声変換モデル。別途保管 |

旧 `DATA_DIR/bot.sqlite` がある場合は、ローカル初回起動時にPGliteへ一度だけ取り込みます。元ファイルは残ります。詳細は [開発・テスト](../development/testing.md) を参照してください。
トークン・DB接続先・モデルなどの機密データをGitや公開Issueへ載せないでください。

## エラーを調べる

1. カードの **エラーID** と発生時刻、直前に押したボタンを確認する。
2. `ERROR_LOG_CHANNEL_ID` の調査カードや、サーバーログの `[error:エラーID]` を探す。
3. 必要なら「バグを報告」でフォームを開き、再現手順を添えて送信する。

Discordの調査カードは処理名・種類・コード・時刻を表示します。例外の詳細・スタックはサーバーログに残し、公開の報告URLには含めません。ログを転載する際も内容を確認してください。
受付期限切れ（コード `10062`）は古い操作や受付の遅延などで起きます。まずコマンドから画面を開き直してください。

## 更新とCI

`main` へのpushで型チェック・ビルド・テストを実行し、成功後にGHCRの `latest`・`sha-…` イメージを更新します。配備先で使うタグの更新・再起動も確認してください。
ビルドキャッシュはGHCRの `buildcache` に保存します。RVC依存関係はDockerfileの専用ステージに分けています。
