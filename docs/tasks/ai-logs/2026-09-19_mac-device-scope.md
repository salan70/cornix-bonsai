# Macの設定の適用先deviceを宣言可能にする

日付: 2026-09-19 / ADR: 0026 / 先行: ADR 0022（deviceスコープ）、ADR 0024（layout宣言）

## 目的

外付けのApple純正USキーボードへ、内蔵USと同じ設定を効かせる。`generateKarabinerRules`が
`device_if`を`is_built_in_keyboard`固定で出していたため、外付けには1件も適用されなかった。

## 調査（Fact）

- 手元のMacBookは**ANSI**。`osascript -l JavaScript` + Carbonで
  `KBGetLayoutType(LMGetKbdType())` が `0x414E5349`（`'ANSI'`）、`LMGetKbdType=46`。
  Karabinerの`Default profile`も`virtual_hid_keyboard.keyboard_type_v2: "ansi"`
- `karabiner_grabber_devices.json`の実測。内蔵は identifiers に vendor / product id を
  持たず `is_built_in_keyboard: true` のみ。外付けは vendor_id / product_id で載る
- `karabiner_cli` にキーボード種別を問い合わせるオプションは無い（`--help` で確認）

## 実装

- `src/core/mac-keymap/types.ts` — `MacDeviceIdentifier`（`{builtIn}` | `{vendorId, productId}`）と
  `DEFAULT_MAC_DEVICES`（内蔵だけ）を追加。`MacKeymapDocument.devices` は必須フィールド
- `src/core/mac-keymap/parse.ts` — `devices:` と flow mapping 2形の受理。省略時は既定を埋める。
  重複と解釈できない項目は `MacKeymapParseError`
- `src/core/mac-keymap/serialize.ts` — `devices` を常に書き出す（正規形は明示）。`deviceFlow` が1行にする
- `src/core/mac-keymap/generate.ts` — `BUILT_IN_ONLY` 定数を廃し、`deviceCondition(devices)` が
  document から `device_if` を組む。`conditionsFor` と `manipulatorsForKey` が条件を受け取る
- `src/core/mac-keymap/validate.ts` — `devices` が空なら `mac-keymap/no-target-device`（error）
- `fixtures/mac-keyboard/desired.yaml` — 正規形に合わせて `devices` を明示。
  `karabiner-baseline.json` は内蔵だけの設定なので生成結果が変わらず無変更

## test

- parse/serialize: 省略時の既定、内蔵+外付けの round-trip、`devices` 重複、解釈できない項目
- generate: identifiers が document から組まれること、layer 1 以上でも device 条件が先頭に残ること
- validate: `devices` が空で error

292 件パス（追加 8 件）。

## 判断の記録

- **条件そのものは外さない**。Cornix LP 自身もキーボードとして列挙されるため、条件を外すと
  Mac の keymap が Cornix LP の firmware keymap と二重に効く。ADR 0022 が
  `is_built_in_keyboard` を置いた隔離の目的は維持し、「内蔵**固定**」だけをやめた
- **外付け用に別ファイルを作る案は不採用**。`identifiers` は OR なので 1 条件で複数デバイスを
  指せる。分けても同じ割り当てが重複するだけ
- **写像は `deviceCondition` の3行だけ**に閉じる。ADR 0025 の「判定を複製すると乖離する」と同じ理由

## 次

- 物理配列ごとのファイル分割（`mac-keyboard.<layout>.yaml`）
- 内蔵配列の検出（Carbon）と apply の対象選択
- `cornix mac devices`（観測一覧から選んで `devices` へ記録）
