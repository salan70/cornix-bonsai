# mac-keyboard.yamlのfromキーを物理配列に対して検証する

日付: 2026-09-12 / Issue: #23（`[I-023]`）/ ADR: 0024

## 目的

Issue #22の実機確認で「US配列のMacBookには`japanese_kana` / `japanese_eisuu`の物理キーが
存在しない」ことが判明した（ADR 0022 Open Question）。語彙としては正当なので既存の
`unknownPositions`を通り、生成されたmanipulatorはlintもloadも通るのに決して発火しない。
この不整合を検出するvalidationを、設計判断ごと実装した。

## 判断

判断の本体と根拠はADR 0024。要点のみ。

- **配列は`mac-keyboard.yaml`に`layout: ansi | jis`として宣言する**。
  `karabiner_grabber_devices.json`からの観測案は、同ファイルにANSI / JISを示す
  fieldが無い（15.3.0実測、`2026-09-06_r006-macbook-verify.md`）ため成立しない
- **YAMLでは省略可・既定`jis`、schemaは`@1`のまま**。型の上では必須にし、既定値を
  埋めるのはparseだけの責務にする
- **severityはwarning**。ADR 0010の「割り当てが1件単位で静かに失われる」に該当する。
  specと`validate.ts`冒頭の「効かないだけはinformation」はunreachable-layerを指した
  要約でADR 0010の正本とズレていたため、正本の3分類の言い回しへ書き換えた
- **`LAYOUT_MISSING_POSITIONS`のansi側はFactとInferenceを区別して持つ**。
  Fact: `japanese_kana` / `japanese_eisuu`（実機確認）。Inference: `international1-9` /
  `non_us_pound` / `non_us_backslash`（HID usageの定義上ANSIに対応キーが無い）。
  jis側は実機Factが無いため空とし、ADR 0024のOpen Questionに残した
- **`keyboard_type_v2`のansi固定を廃止**し`document.layout`から導出。JIS前提の
  fixtureと矛盾していた点の修正を兼ねる

## 変更

- `src/core/mac-keymap/types.ts` — `MacKeyboardLayout` / `DEFAULT_MAC_LAYOUT`、
  `MacKeymapDocument.layout`（必須）
- `src/core/mac-keymap/parse.ts` — `layout:`行の受理（`ansi` / `jis`以外は
  `MacKeymapParseError`）、省略時`jis`
- `src/core/mac-keymap/serialize.ts` — `layout`行を常に書き出す
- `src/core/mac-keymap/key-codes.ts` — `LAYOUT_MISSING_POSITIONS`
- `src/core/mac-keymap/validate.ts` — `positionsNotOnLayout`
  （`mac-keymap/position-not-on-layout` / warning）。冒頭コメントのseverity文言修正
- `src/core/mac-keymap/generate.ts` — `keyboard_type_v2: document.layout`
- `fixtures/mac-keyboard/desired.yaml` — `layout: jis`を明示
- test — `mac-keymap.test.ts`（省略時jis / ansi round-trip / 不正値で落ちる）、
  `validate.test.ts`（ansi×japanese_kanaがwarning / jisなら診断ゼロ / Inference側も
  warning / unknown-positionと二重報告しない）、`generate.test.ts`（layout導出）
- `docs/specs/mac-keymap.md` — 各節へlayoutの記述、診断表へ行追加、severity文言修正
- `docs/decisions/0024-mac-keyboard-layout-declaration.md` — 新規
- `docs/decisions/0022-macos-keyboard-management.md` — Open Questionへ解消の追記

## 検証

- `just typecheck` / `just test`（257件、+8）/ `just lint` / `just docbridge-check` 通過
- `apply.test.ts` / `src/cli/mac.test.ts` / `src/ui/browser-export.test.ts`のインライン
  YAML（layout行なし）は既定`jis`でそのまま通ることを確認。変更不要だった

## Open Question

- JIS配列のMacBookに存在しないANSI固有キーの集合は実機Factが無く空のまま
  （ADR 0024のOpen Question参照）
