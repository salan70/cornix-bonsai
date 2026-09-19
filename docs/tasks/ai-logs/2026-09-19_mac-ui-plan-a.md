# Browser UI を案 A（編集対象ドロップダウン）へ移す

日付: 2026-09-19
先行: ADR 0025（盤面編集）、ADR 0027（配列ごとのファイル）

## 目的

Core / CLI 済みの残作業として、Browser UI を案 A へ移す。
`keymap.yaml` が無くても Mac 編集が成立するようにする。
CLI の `cornix mac *` と対称にする。

## 判断

- `DEFAULT_MAC_LAYOUT` は YAML 省略時の parse 既定だけ残す。
- UI の作成は選んだ配列の `mac-keyboard.<layout>.yaml` を書く。
- workspace は `keymap.yaml` が無くても開ける。
- Browser は内蔵配列を検出しない。
- 「この Mac には無い」は出さない。

## 実装

- `EditTarget` を Cornix と `{ kind: "mac"; layout }` に分けた。
- Cornix タブは Keymap / Overview / Behaviors / References。
- Mac タブは Keymap / References。
- `probeStore` は directory を開けた時点で `ready` を返す。
- Cornix と Mac を独立に畳む。
- 保存キューは ready な配列ごとに 1 本。
- Mac 表示の status bar は保存先 YAML と CLI apply と asset 書出だけ。
- Mac References はファイル、配列、devices、診断を出す。
- 検出配列は CLI 任せと書く。
- picker は `macKeycodeSupport` で disabled にする。
- 動作 select は basic / modTap / layerSwitch / none。
- layer 行右端に適用先チップを置く。追加は `cornix mac devices`。

## 文書

- `docs/specs/ui.md` を対象別タブと独立 probe へ書き換えた。
- ADR 0024 の「実運用 = JIS」を引き下げた。
- parse 既定は後方互換として残した。
- ADR 0027 に Browser が配列を選ぶ追記を足した。

## 検証

各 commit で `just test` / `typecheck` / `lint` / `docbridge-check`。
