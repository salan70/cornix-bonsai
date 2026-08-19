# Fixtures

Fixtureは、parse、round-trip、analysis、renderingを検証するための代表的かつsanitize済みの入力データです。

想定する範囲:

- 最小keymap
- layers
- Tap Dance
- Combo
- settings
- 未知または保持対象の`.vil` field

個人利用中のキーボード設定をPublic fixtureとして追加する場合は、内容を確認し、必要なsanitizeを行ってからcommitします。

## `cornix-lp/`

- `baseline.vil`: Cornix LPの実export（Vial `vial_protocol: 6` / `via_protocol: 9`）。
  macro・combo・key_overrideは未使用のため空で、テキストなどの個人情報は含まない。
  `uid`は実機のキーボードidをそのまま残している（round-tripの検証に必要なため）。
- `edge-cases.vil`: escape hatch を踏むための合成fixture。未知のtop-level field
  (`vendor_extension`)、ネストした未知field (`key_override[].future_field`)、
  `layout_options: -1`（Vialが実機から読まなかった状態）、hex表記のkeycode、
  非ASCIIのmacro textを含む。`baseline.vil`には未知fieldが1つも無いため、
  raw保持（ADR 0001）はこのfixtureでしか検証できない。
- `invalid-cases.vil`: validationのerror / warningを踏むための合成fixture。容量超過の
  `MO(9)`、definitionに無い`USER99`、未知のkeycode`KC_BOGUS`、全段`KC_NO`の空tap dance、
  未対応のqsid`999`、`TO(1)`だけで入って戻れないlayerを含む。`baseline.vil`は実機exportで
  error / warningを1件も出さないため、severity modelはこのfixtureでしか検証できない。
- `vial-definition-v1.12.json`: 公式firmware V1.12のUF2から取り出したkeyboard definition。
  Vialが実機から配るものと同一で、matrix対応・encoder数・custom keycodeの定義元。
  取り出し手順は`spikes/r-002-cornix-lp-matrix/README.md`にある。
