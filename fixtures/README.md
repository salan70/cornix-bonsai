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
