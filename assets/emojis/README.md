# Botの絵文字素材

ゲーム用35種類・バッジ84種類の計119種類です。原本は `svg/`（SVG）と `originals/`（PNG）に保存しています。起動時の同期には128×128px PNGを使います。ローカル・本番で同じ素材を登録し、素材が変わった場合だけ新しいIDへ切り替えます。

## フォルダー構成

```text
svg/                  # SVG原本
  characters/         # letters（英字）・numbers（数字）
  games/              # othello・connectfour
  status/             # 従来のPNGから輪郭を抽出したステータスSVG
  badges/             # general・app・account_age・streaming など
originals/
  badges/             # バッジのPNG原本。general・app・gifting ごとに分類
  status/             # 以前のステータス絵文字のPNG原本
png/                 # Discord登録用PNG。原本と同じ用途・種類で分類
```

登録名はマニフェストの `name` と同じです。画像の更新判定は `DATA_DIR/emoji-sync.json` に保存し、名前に世代やハッシュは付けません。

バッジの継続期間・色違いは `badges/nitro/`・`badges/boost/` などにまとまっています。個々の原本と出力先はマニフェストの `sourceFile`・`outputFile` で追跡できます。

- **英字A〜N・数字0〜9**：Twitter Twemoji v14.0.2のSVGから生成。
- **Discordバッジ84種類**：73種は公式SVG、10種は公式PNG、Last Meadowの1種はアーカイブ画像。すべて `b_` 接頭辞を付けています。[取得元](SOURCES.md) を参照。
- **盤面**：このプロジェクトのSVG。外周に約2〜3pxの透明な余白を設けています。
- **ステータス5種類**：従来のPNGから輪郭を抽出したSVGです。背景の不透明度は約14%、記号は不透明です。比較用のPNG原本も `originals/status/` に保存しています。

Twemoji graphics: Copyright Twitter, Inc and other contributors. Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
[元のSVG](https://github.com/twitter/twemoji/tree/v14.0.2/assets/svg) · [同梱ライセンス](LICENSE-TWEMOJI)

Discordのバッジ素材はDiscordに帰属します。英字・数字はTwemojiの原本、盤面はこのプロジェクトの素材、ステータスは従来の登録画像です。

原本を変更した場合は `bun --no-env-file scripts/build-emojis.ts` でPNGを生成し直してください。
