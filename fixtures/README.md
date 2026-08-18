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
- `vial-definition-v1.12.json`: 公式firmware V1.12のUF2から取り出したkeyboard definition。
  Vialが実機から配るものと同一で、matrix対応・encoder数・custom keycodeの定義元。
  取り出し手順は`spikes/r-002-cornix-lp-matrix/README.md`にある。
