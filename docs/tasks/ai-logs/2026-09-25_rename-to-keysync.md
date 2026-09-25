# 製品名を KeySync へ改める

2026-09-25。
Cornix LP 以外のキーボードも扱うようになったため、製品名を Cornix Bonsai から KeySync へ改めた。
名前と識別子の決定は ADR 0035、旧形式の扱いは ADR 0036 に記録した。

## Fact

- GitHub repository は `salan70/keysync` へ、ローカルディレクトリは `Projects/Tools/keysync` へ改名済みだった。
- `readDefinitionBinding` は `keymap.yaml` の `definition.path` と `definitionPath(digest)` の完全一致を要求する。管理ディレクトリを `keysync/` にすると、既存の `keymap.yaml` はすべて読めなくなる。
- Karabiner の profile 名と rule の説明は YAML の `profile:` 値から作られる。定数 `CORNIX_PROFILE_NAME` は新規作成時の既定値にだけ使われていた。
- この Mac の `~/.config/karabiner/karabiner.json` に `Cornix Bonsai` profile は無かった（`Default profile` のみ）。
- DocBridge の anchor になっている改名対象は `generateCornixProfile` だけだった。

## Decision

| 論点                     | 決定                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 変える範囲               | 表示名と識別子のすべて。機種を指す識別子は変えない（ADR 0035）                                                                                                       |
| ロゴ                     | 改名の commit では 🌱 のまま残し、uiux-numa で選んだ `tilt-confetti` を後から入れた（ADR 0037）                                                                      |
| schema ID                | 旧 ID も読み、書き出しは新 ID だけ。版は据え置く（ADR 0036）                                                                                                         |
| Karabiner の旧 profile   | `mac-keymap/legacy-profile-present`（information）で削除を案内するだけ。置き換えも削除もしない（ADR 0036）                                                           |
| 関数名                   | `generateOwnedProfile`。製品名を関数名に入れない                                                                                                                     |
| Karabiner の変数         | `keysync_layer_N`。適用のたびに全再生成されるので互換は要らない                                                                                                      |
| 管理ディレクトリ         | `cornix/` から `keysync/` へ明示操作で移す。入口は Web UI の復旧カード（`data-recovery="legacy-layout"`）と `keysync migrate`。旧 `cornix/` は削除しない（ADR 0036） |
| 両方を読むフォールバック | 採らない。新 path を指すのに実体は旧ディレクトリ、という状態を作れてしまう                                                                                           |
| ブラウザの保存と環境変数 | `keysync`、`keysync.theme`、`keysync.icon-style`、`KEYSYNC_WORKSPACE`。旧名は読まず、引き継がない（ADR 0036）                                                        |
| 過去の記録               | ADR 0001〜0034、既存の作業ログ、Spike は当時の名前のまま残す                                                                                                         |

## ロゴ

- uiux-numa の `keysync-logo` で、利用者が 3 世代の比較から `tilt-confetti` を採用した（uiux-numa `3001a41`）。
- 多色版を箱なしで header と入口に置き、黄の箱を外した。黄の浮いたキーが黄の箱に溶けるためである（ADR 0037）。
- favicon は同じ形に色を書いた `public/favicon.svg` で、墨のキーだけを明暗で切り替える。
- 🌱 の大きさだけに使っていた `--font-size-logo-large` と `--font-size-icon` を削除した。

## Open Question

- 旧形式の読み込みと移行の入口をいつ取り除くか（ADR 0036）。
