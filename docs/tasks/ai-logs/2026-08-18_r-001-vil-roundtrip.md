# 2026-08-18 R-001 `.vil` round-trip調査

対象Issue: #1 `[R-001] .vil のround-trip挙動を検証する`

## 調査方法

- vial-guiのソース（`protocol/keyboard_comm.py`、`protocol/{tap_dance,combo,key_override,alt_repeat_key,macro}.py`、
  `keycodes/keycodes.py`、`any_keycode.py`）を読み、`.vil`の生成・復元の実装を確認した
- 実機export 2件（Cornix LP、`vial_protocol: 6` / `via_protocol: 9`）を入力に、
  import → model → export のSpikeを書いて突き合わせた
- Vialのkeycode解決ロジックをpythonでそのまま実行し、正規化の揺れを測った

## Fact

- `.vil`のtop-level keyは`version, uid, layout, encoder_layout, layout_options, macro,
vial_protocol, via_protocol, tap_dance, combo, key_override, alt_repeat_key, settings`の13個
- Cornix LPの実exportは10 layer × 8 row × 7 col。物理キーのない位置は`-1`で、`KC_NO`とは別物
- `uid`は64bit整数（実測`16882930253541522617`）。JavaScriptの`JSON.parse`で
  `16882930253541523000`に化ける
- Vialの出力はpython `json.dumps`既定。区切りは`", "` / `": "`、非ASCIIは`\uXXXX`エスケープ
- 実exportに含まれる固有keycode文字列128種は、いずれもVialの正規化で変化しなかった
- `Keycode.normalize`（= `serialize(deserialize(x))`）は表記を畳む:
  `KC_BSPC` → `KC_BSPACE`、`KC_LCTL` → `KC_LCTRL`、`KC_TRANSPARENT` → `KC_TRNS`、
  `LT(1,KC_A)` → `LT1(KC_A)`、`MT(MOD_LSFT,KC_A)` → `LSFT_T(KC_A)`、`KC_PERC` → `LSFT(KC_5)`
- 解決できない文字列は`deserialize`が例外を投げず`0`（= `KC_NO`）を返す。
  `KC_FOO`、`RESET`、`KC_LEAD`、`QK_GESC`は無言で`KC_NO`になる
- keycode語彙はキーボード定義依存。`recreate_keyboard_keycodes`が
  layer数から`MO(n)` / `LT n(kc)`、macro数から`M(n)`、tap dance数から`TD(n)`を生成する。
  範囲外は`M40` → `KC_NO`、`MO(12)`（10 layer時） → `0x522c`のようにhex文字列へ落ちる
- `restore_layout`は現在のlayoutに存在する`(layer,row,col)`しか書かない。
  余剰entryは無言で捨てられる。`settings`も`is_qsid_supported`で絞られる

## Spike結果

`spikes/r-001-vil-roundtrip/roundtrip.mjs`

- 実export 2件: 意味一致・byte一致ともに成立（`uid`の文字列保持と`json.dumps`互換出力が前提）
- 合成fixture（未知field・非ASCII macro・hex keycode・`key_override`入り）:
  意味一致は成立。byte一致はpythonのfloat表記（`1000.0` vs `1000`）だけ差分が残る
- `uid`を素の`JSON.parse`で扱うと、round-trip時点で別のキーボードidになる

## Inference

- rawを保持しない設計にすると、Vialの将来versionの追加fieldと、alias表記のdiff汚染で
  「触っていない箇所が変わる」事象が起きる
- byte一致はpythonの数値表記まで模倣しない限り一般には成立しない。保証対象にすべきでない
- 実機Applyでは、Vial互換の正規化・切り捨てを自前で再現しない限り
  「書いた内容」と「読み戻す内容」がズレる。write後のverifyは必須

## Decision

ADR `docs/decisions/0001-vil-round-trip.md` に記録した。
rawを保持し、意味round-tripのみ保証する。`uid`は文字列、未知fieldはraw保持、
keycode文字列は正規化せずそのまま持つ。

## Open Question

- `layout_options`のbit意味はキーボード定義（`vial.json`）依存。R-002で確認する
- `settings`のqsid → 意味の対応表がどこまで必要か。D-003の入力
- Vial GUIが`.vil`を読む際、`vial_protocol`が異なる`.vil`を渡した場合の挙動は未検証
  （`restore_layout`にversion checkがない一方、keycode解決はprotocol依存）
- 実機からreadした状態と`.vil`の等価性は未検証。R-003で扱う
