# mac-keyboard.yamlは物理配列をlayoutとして宣言し、無いキーへの割り当てをwarningにする

状態: 採用

2026-09-12に、ADR 0022のOpen Question「US配列のMacBookには`japanese_kana` / `japanese_eisuu`の
物理キーが存在しない。desired stateのfromキーは対象マシンの物理配列に依存する」
（#22で判明、#23で対応）の扱いを決めた。

## 背景

`validateMacKeymap`の`unknownPositions`はKarabinerの`key_code`語彙（`KARABINER_POSITIONS`）
しか見ない。`japanese_kana`は語彙としては正当なので通るが、US配列の実機ではそのキーが
物理的に存在しないため、生成されたmanipulatorはlintを通りKarabinerにloadもされるのに
**永久に発火しない**。`karabiner_cli --lint-complex-modifications`も語彙しか見ないため、
この不整合はどの層でも検出されない（2026-09-06実機確認、
`docs/tasks/ai-logs/2026-09-06_r006-macbook-verify.md`）。

検証するには対象マシンの物理配列（ANSI / JIS）を知る必要がある。また
`generateCornixProfile`は`virtual_hid_keyboard.keyboard_type_v2`を`ansi`固定で出しており、
JIS前提のfixture（`fixtures/mac-keyboard/desired.yaml`）と既に矛盾している。

## 選択肢

1. `mac-keyboard.yaml`に`layout: ansi | jis`を宣言させる
2. Karabinerの観測結果（`/Library/Application Support/org.pqrs/tmp/karabiner_grabber_devices.json`）
   から物理配列を得る
3. 配列情報を持たず、配列依存キーへの割り当てを一律warningにする

## 決定

案1を採る。

- `MacKeymapDocument`へ`layout: "ansi" | "jis"`を**必須フィールド**として追加する。
  YAML側では省略可とし、`parseMacKeymapYaml`が省略時に`jis`を埋める。既定を`jis`に
  するのは既存fixtureと実運用（JIS配列のMacBook）に合わせるため。schemaは
  `cornix-bonsai/mac-keymap@1`のまま上げない（省略時の挙動追加は互換性を壊さない）
- `serializeMacKeymapYaml`は`layout`行を**常に**書き出す。正規形は明示とする
- 宣言した配列に物理的に存在しないキーをfromに書いた場合、
  `mac-keymap/position-not-on-layout`（**warning**）を出す
- 配列ごとの「存在しないキー」集合は`key-codes.ts`の`LAYOUT_MISSING_POSITIONS`が
  単一の定義元。`ansi`側はFactとInferenceを区別して持つ
  - Fact: `japanese_kana` / `japanese_eisuu`（2026-09-06実機確認）
  - Inference: `international1`〜`international9` / `non_us_pound` / `non_us_backslash`
    （HID usageの定義上JIS / ISO配列専用で、ANSI物理配列に対応キーが無い。実機Factは無い）
  - `jis`側は空集合（後述のOpen Question）
- `generateCornixProfile`の`keyboard_type_v2`は`ansi`固定をやめ、`document.layout`から
  導出する（値はKarabinerの`keyboard_type_v2`の語彙と一致するため写像表は持たない）

## 理由

- **案2は成立しない**。`karabiner_grabber_devices.json`にはANSI / JISを示すフィールドが
  無い（Karabiner 15.3.0で実測。記録されるのは`is_built_in_keyboard`・product・transport
  など）。観測で得られない以上、宣言以外に配列を知る手段が無い
- **案3はJIS実機での正当な使用にノイズを出し続ける**。fixtureも実運用も
  `japanese_kana` / `japanese_eisuu`を使っており、正しい構成が常に警告される規則は
  規則の側が間違っている（ADR 0010の「severityは実fixtureで較正する」と同じ姿勢）
- **severityはADR 0010の判定規則に従いwarning**。存在しないキーへの割り当ては
  「割り当てが1件単位で静かに失われる」に該当する（そのmanipulatorだけが決して
  発火しない）。errorの定義（座標の意味が変わるか構造が壊れている）には当たらない。
  なお`docs/specs/mac-keymap.md`と`validate.ts`冒頭の「書いたとおりには入るが効かない
  だけのものはinformation」という文言は`unreachable-layer`（到達経路を足せば意味を持ち、
  何も失われない）を指した要約であり、ADR 0010の正本の3分類とズレるため、本ADRに
  合わせて正本の言い回しへ書き換える
- **宣言はdesired stateの一部**。fromキーの妥当性が配列に依存する以上、配列は
  keymapの前提条件であり、`mac-keyboard.yaml`に書くのが宣言的で、Semantic Coreの
  filesystem非依存も保てる
- **必須フィールド + parseで既定値**の形にするのは、既定値ロジックをparse 1か所に
  閉じ、documentを組む全経路（generate・validate・test）でlayoutを明示させるため

## 影響

- `mac-keymap/position-not-on-layout`（warning）が診断に加わる。`unknown-position`
  （error）とは排他（`LAYOUT_MISSING_POSITIONS`は`KARABINER_POSITIONS`の部分集合）
- `keyboard_type_v2`のansi固定が直る。JIS実機ではapply時に`jis`が書かれる。
  `diffOwnedProfile`はmanipulatorしか比較しないためこの変更はdiffに現れないが、
  `replaceOwnedProfile`のmergeで書き変わる
- ADR 0022のOpen Question最終項（fromキーの物理配列依存）は本ADRで解消する
- 物理配列の自動判定をBrowser UIへ載せること、ANSI / JIS以外の配列は扱わない（#23の対象外）

## Open Question

- JIS配列のMacBookに存在しないANSI固有キー（例: `grave_accent_and_tilde`の有無）は
  実機Factが無いため、`jis`側の集合は空にしてある。Factが得られたら
  `LAYOUT_MISSING_POSITIONS`へのデータ追加だけで対応できる
