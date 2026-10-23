# バッジ素材とプロフィール表示

[目次](../README.md)

バッジ素材は全84種類です。名前はすべて `b_` で始まり、通常のゲーム絵文字と区別できます。

| 種類 | 数 | 名前の例 |
| --- | --- | --- |
| 共通・イベント | 18 | `b_staff`・`b_quest`・`b_orbs_apprentice`・`b_bug_hunter_gold` |
| アプリ | 3 | `b_support_commands`・`b_automod`・`b_premium_app` |
| ギフト | 6 | `b_gift_patron`〜`b_gift_legend` |
| アカウント年齢 | 10 | `b_account_age_1`〜`b_account_age_10` |
| 配信時間 | 10 | `b_stream_1`〜`b_stream_10` |
| ゲーム時間 | 10 | `b_game_time_1`〜`b_game_time_10` |
| ゲームの種類 | 10 | `b_game_variety_1`〜`b_game_variety_10` |
| Nitro継続期間 | 8 | `b_nitro_bronze`〜`b_nitro_opal` |
| ブースト継続期間 | 9 | `b_boost_1`〜`b_boost_9` |

基本バッジにはNitroの基本表示、Bug Hunterの緑・金、HypeSquad3種、早期サポーター、旧ユーザー名、Last Meadow、旧イベントなども含みます。

## 共通・イベントのバッジ

| 名前 | 素材名 |
| --- | --- |
| Discord Staff | `b_staff` |
| Partner | `b_partner` |
| Moderator Programs Alumni | `b_mod_alumni` |
| Early Verified Bot Developer | `b_early_bot_dev` |
| Active Developer | `b_active_dev` |
| Bug Hunter（緑・金） | `b_bug_hunter_green`・`b_bug_hunter_gold` |
| HypeSquad Events | `b_hype_events` |
| HypeSquad Bravery・Brilliance・Balance | `b_hype_bravery`・`b_hype_brilliance`・`b_hype_balance` |
| Nitro・Early Supporter | `b_nitro`・`b_early_supporter` |
| 旧ユーザー名 | `b_legacy_username` |
| Quest・Orbs Apprentice | `b_quest`・`b_orbs_apprentice` |
| Clown・Last Meadow | `b_clown`・`b_last_meadow` |

## アプリ・ギフト・段階別のバッジ

アプリ用はコマンド対応（`b_support_commands`）、AutoMod（`b_automod`）、Premium App（`b_premium_app`）の3種類です。

ギフトはPatron・Champion・Luminary・Icon・Hero・Legendの6種類です。アカウント年齢、配信、ゲーム時間、ゲームの種類は各10段階、ブーストは9段階です。Nitroの色はBronze・Silver・Gold・Platinum・Diamond・Emerald・Ruby・Opalの8種類を収録しています。各段階の名前と素材は [マニフェスト](../../assets/badge-manifest.json) で確認できます。

## 素材の出典

Last Meadowの単体素材はアーカイブを使用しています。各ファイルのURL・形式・ハッシュは [素材一覧](../../assets/badge-manifest.json) に記録しています。

## infoで表示できる範囲

`info` は公開フラグのバッジと、公開日時から計算した期間の目安を分けて表示します。

- **公開バッジ**：Staff・HypeSquad・Bug Hunterの緑／金など、取得できる公開フラグ。
- **アカウント年齢**：作成日時から計算した年数・月数。1年以上は対応する年齢バッジを表示し、10段階まで対応。
- **ブースト継続（このサーバー）**：このサーバーでの継続日時から9段階を選択。他サーバーを含む最長期間とは異なります。
- **Nitro（推定）**：アバター・バナーからの推定。継続期間や色の段階は推測しません。

年齢・ブーストの段階は目安であり、プロフィールで選択中の実際のバッジを取得したものではありません。Botアカウントに年齢・ブーストのバッジは付きません。

通常のBot APIでは、ギフト数・プレイ時間・配信時間・Nitro継続期間・プロフィールで選択中のバッジ一覧などを取得できません。素材を登録していても、未確認のバッジや段階を所持していると推定して付けることはありません。

参考: [Discord公式のバッジ解説](https://support.discord.com/hc/ja/articles/44369363856663-Discord-Profile-Badges-What-Each-Badge-Means) · [Discord Wiki](https://discord.fandom.com/wiki/Badges) · [公開User API](https://docs.discord.com/developers/resources/user)
