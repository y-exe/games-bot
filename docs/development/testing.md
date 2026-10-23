# 開発・テスト

[目次](../README.md) · [セットアップ](../operations/setup.md)

## コードの配置

| 場所 | 役割 |
| --- | --- |
| `src/index.ts` | 起動・イベント受付・コマンド振り分け |
| `src/commands/` | コマンド定義・入力・権限・クールダウン |
| `src/games/` | ゲームのルール・状態管理・操作・Botの応手 |
| `src/data/` | ポイント・DB・旧データの取り込み |
| `src/services/` | API・画像・音声・定期処理 |
| `src/ui/` | Components v2のカード・絵文字・エラー表示 |
| `tests/` | Bunで動く自動テスト |
| `assets/` | フォント・画像素材 |
| `scripts/` | コマンド登録・素材の生成・運用ツール |

ゲームの状態と期限は `games/session.ts`、進行・保存・精算は `games/manager.ts` で管理します。チェス操作は `games/chess-actions.ts`、Botの応手は `games/bot-turn.ts`、画面は `ui/game-card.ts` と各ゲームの `*-board.ts` に分けています。
ヘルプの本文・カテゴリ切替は `commands/help.ts` にまとめています。

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

コマンドと絵文字は起動時に差分を自動同期します。手動確認は `bun run commands`・`bun run emojis` です。コマンド同期の初回登録・変更検知・環境ごとの同期先は `tests/command-sync.test.mjs` で検証します。要約や読み上げの実動確認には設定した外部APIを使います。

絵文字の同期対象は `src/ui/emoji-assets.ts` に集約しています。通常素材・バッジは各マニフェスト、盤面素材は各ゲームの一覧へ追加します。初回登録・素材追加後の起動・再起動時の再利用を `tests/emoji-sync.test.mjs` で確認できます。

原本と再生成コマンドは [素材のREADME](../../assets/emojis/README.md) を参照してください。作業用のプレビューは `.local/`、再利用する生成スクリプトは `scripts/` に置きます。

## DBを変更するとき

ローカルPGliteと本番PostgreSQLの両方で使うSQLを確認します。ポイントは `bigint` として扱い、通常の `number` に丸めないでください。
旧SQLiteの取り込みは読み取り専用で、元ファイルを保持します。移行の検証は `tests/local-store.test.mjs` を参照してください。

## コミット

コミットは `git commit -S` で署名し、メッセージは `fix: エラー表示を修正` のようにConventional Commits形式の簡潔な日本語にします。コミット後に署名を検証してください。
