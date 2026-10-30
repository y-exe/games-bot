# Botの絵文字素材

共通47・バッジ84・チェス82・マインスイーパー29・盤面共通73・文字画像5の計320種類です。初回起動ですべて登録し、追加・変更後の起動で差分を同期します。登録IDは `DATA_DIR/emojis.json`、画像の更新情報は `DATA_DIR/emoji-sync.json` に保存します。

## 配置

| 場所 | 内容 |
| --- | --- |
| `svg/characters/` | 青い英字・数字、緑・赤の派生、透明マス |
| `svg/games/` | オセロ・四目並べ・マインスイーパー |
| `svg/status/` | ステータス |
| `svg/badges/` | SVGで配信されているバッジ |
| `originals/` | バッジ・ステータス・文字画像のPNG原本 |
| `png/` | Discord登録用128px PNG。用途ごとに分類 |
| `../../src/ui/chess-emojis.ts` | チェスのSVG・PNG生成 |

名前は青 `b_3`・`b_A`、緑 `g_3`・`g_A`、赤 `r_3`・`r_A`、チェス `c_`、マインスイーパー `ms_` です。座標は1〜9、A〜Zを使用し、位置合わせには `board_spacer` を使います。

## 素材を更新する

リポジトリのルートで実行します。

| 対象 | コマンド |
| --- | --- |
| 共通・バッジのPNG | `bun --no-env-file scripts/build-emojis.ts` |
| 緑・赤の文字と透明マス | `bun --no-env-file scripts/build-board-markers.ts` |
| マインスイーパーのSVG | `bun --no-env-file scripts/generate-minesweeper-svg.mjs` |
| マインスイーパーのPNG | `bun --no-env-file scripts/build-minesweeper-emojis.ts` |
| 青い英字の再取得 | `bun --no-env-file scripts/fetch-character-emojis.ts` |
| text1〜text5の文字絵文字 | `bun --no-env-file scripts/build-text-emojis.ts` |
| text5の塗り | `bun --no-env-file scripts/build-text5-gradient.ts` |

チェスは起動時に生成します。同期対象は `src/ui/emoji-assets.ts` に集約しています。共通・バッジはマニフェスト、ゲーム素材は各ゲームの定義一覧で管理します。

## 出典

- 英字・数字：Twitter Twemoji v14.0.2。[原本](https://github.com/twitter/twemoji/tree/v14.0.2/assets/svg) · [CC BY 4.0](LICENSE-TWEMOJI)
- Discordバッジ：[取得元一覧](SOURCES.md)。素材はDiscordに帰属します。
- マインスイーパー：[状態の一覧](svg/games/minesweeper/README.md) · [Phosphor Iconsのライセンス](svg/games/minesweeper/icons/README.md)
- その他の盤面：このプロジェクトのSVG。ステータスは従来の登録画像をもとにしています。
