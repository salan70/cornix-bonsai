# keyboard definitionを実機由来の単一の定義元として扱う

状態: 採用

## 背景

Cornix Bonsaiはmatrix座標 `(layer, row, col)` と物理キーの対応を持たないと、rendering
（SVG / PDF）もsemantic diffの読みやすい表示もできない。この対応はVialのkeyboard definition
（`vial.json`）にあり、Vialはそれを**実機から**取得する（`CMD_VIAL_GET_DEFINITION`で
xz圧縮JSONを分割取得する）。

R-002の調査（Spike: `spikes/r-002-cornix-lp-matrix/`）で、以下が確認できた。

- Cornix LPの公式firmware（RMK）はdefinitionをfirmwareへ埋め込む。V1.6〜V1.12の
  `layouts.keymap`は完全に同一で、matrix対応はfirmware versionによらない
- 一方で`customKeycodes`は定義順がそのまま`USER00`, `USER01`, …になる。
  公式firmwareは8個、コミュニティ製のCornix向けdefinitionは9〜12個で順序も違うため、
  同じ`USER01`が別のkeycodeを指す
- `layouts.labels`は公式firmware V1.10で追加されたが、中身は
  `[["Firmware Version", "V1.12"]]`で、firmware versionの表示にしか使われていない

## 選択肢

1. Cornix LPの配列をコード内のテーブルとしてhard-codeする
2. keyboard definitionをworkspaceの入力として扱い、実機またはfirmwareから取得したものを使う
3. definitionを参照せず、`.vil`の`-1`の位置だけから配列を推定する

## 決定

案2を採る。keyboard definitionをCornix Bonsaiの入力データとして持ち、matrix対応・
encoder数・custom keycodeの意味はすべてそこから導出する。

- 取得元の優先順は「実機から読んだdefinition」＞「配布firmwareから取り出したdefinition」
- 検証用fixtureとして`fixtures/cornix-lp/vial-definition-v1.12.json`を版つきで置く
- keymapとdefinitionの組をworkspaceで対応づけ、どのdefinitionで解釈したかを記録する
- `USER00`のようなcustom keycodeは、definitionの定義順で解決する
- definitionの`layouts.keymap`はVialと同じKLE展開規則で解釈する（vial-guiの`kle_serial.py`が正）

## 理由

- 案1はfirmware更新やコミュニティfirmwareでcustom keycodeの意味が変わったときに、
  ユーザーの設定を静かに誤って表示・書き換えることになる
- 案3は`-1`の位置しか分からず、物理座標も左右の別もencoderの本数も得られない。
  renderingが成立しない
- definitionは実機が配るものなので、実機と食い違わない唯一の定義元は実機側にある

## 影響

- workspaceにdefinitionの置き場と、keymapとの対応づけが要る（D-004の入力）
- Semantic Modelは`(layer, row, col)`と、definition由来の物理配列を分けて持つ必要がある。
  物理配列はrendering用の派生データであり、`.vil`のround-trip対象ではない（ADR 0001）
- custom keycodeはdefinition依存のため、正規化テーブル（ADR 0001の影響で必要になったもの）は
  definitionを引数に取る形になる（D-001およびD-003の入力）
- definitionを実機から読む経路はR-003 / R-004で確認する。それまでは
  配布firmwareから取り出したfixtureで代替する
