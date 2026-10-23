# マインスイーパー

128pxの盤面素材。外周3pxは透明です。

明暗のマス14組と操作用カーソルの計29種類です。暗いマスは名前に _d を付けます。旗・地雷・カーソル・×は [Phosphor Icons](icons/README.md) を使用しています。

| 名前 | 表示 |
| --- | --- |
| `ms_c` | 未開封 |
| `ms_o` | 開いた空白 |
| `ms_1`〜`ms_8` | 周囲の地雷数 |
| `ms_f` | 旗 |
| `ms_b` | 地雷 |
| `ms_x` | 踏んだ地雷 |
| `ms_w` | 間違った旗 |
| `ms_a` | マスを開く操作 |

PNGは `bun --no-env-file scripts/build-minesweeper-emojis.ts` で生成します。

数字の原本は [文字素材](../../characters/numbers/)、ライセンスは [CC BY 4.0](../../../LICENSE-TWEMOJI) を参照してください。
