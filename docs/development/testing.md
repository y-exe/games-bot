# 開発・テスト

[目次](../README.md) · [セットアップ](../operations/setup.md)

## コードの配置

| 場所 | 役割 |
| --- | --- |
| `src/index.ts` | 起動・イベント受付・コマンド振り分け |
| `src/commands/` | コマンド定義・入力・権限・クールダウン |
| `src/games/` | 対戦状態・ゲームのルール |
| `src/data/` | ポイント・DB・旧データの取り込み |
| `src/services/` | API・画像・音声・定期処理 |
| `src/ui/` | Components v2のカード・絵文字・エラー表示 |
| `tests/` | Bunで動く自動テスト |
| `assets/` | フォント・画像素材 |

## 通常の確認

リポジトリのルートで順に実行し、失敗した場合はそこで原因を確認します。

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun run test:security
```

`test:security` はセキュリティだけでなく、ゲーム・ポイント・DB・要約・画像Workerなどの回帰テストも実行します。ビルド済みWorkerを使うテストがあるため、先にビルドしてください。
これらの自動テストではDiscordへの投稿や有料APIの呼び出しを行いません。

## Discord上で確認

テストBot・テストサーバーを設定して `bun run dev` で起動します。`READY` の環境が `local`、アカウントがテストBotであることを確認します。

- 表示変更：本文・ボタン・期限切れを確認。
- ゲーム変更：参加者・手番・古いボタン・終了後の精算を確認。
- ポイント変更：二重実行や失敗時に残高が不正に動かないか確認。

`bun run commands` はコマンド登録、`bun run emojis` は手動の絵文字同期です。起動時にも絵文字の同期を行いますが、同じ素材は再利用します。要約や読み上げの実動確認には設定した外部APIを使います。

絵文字の原本は `assets/emojis/svg/` と `assets/emojis/originals/` です。原本を変更した場合は `bun --no-env-file scripts/build-emojis.ts` でDiscord登録用PNGを生成します。バッジは原本の形・色を保ち、取得元とハッシュは `assets/badge-manifest.json` に記録します。

## DBを変更するとき

ローカルPGliteと本番PostgreSQLの両方で使うSQLを確認します。ポイントは `bigint` として扱い、通常の `number` に丸めないでください。
旧SQLiteの取り込みは読み取り専用で、元ファイルを保持します。移行の検証は `tests/local-store.test.mjs` を参照してください。

## コミット

コミットは `git commit -S` で署名し、メッセージは `fix: エラー表示を修正` のようにConventional Commits形式の簡潔な日本語にします。コミット後に署名を検証してください。
