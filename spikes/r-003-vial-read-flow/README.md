# R-003 Spike: Vial の read フローで deviceState を再構築する

実機から `deviceState` を組み立てるのに必要な command 列と byte 並びを確かめるための
使い捨てコードです。本実装ではありません。判断の結果は
`docs/decisions/0003-device-read-flow.md` にあります。

## 実行

```bash
nix develop -c node spikes/r-003-vial-read-flow/read-flow.mjs
```

## 何を検証しているか

実機が無い状態でも protocol の理解を falsify できるよう、encode 側と decode 側を
**別々の実装から独立に写して**突き合わせています。

- `mock-device.mjs` — RMK (tag `rmk-v0.8.2`) の `rmk/src/host/via/mod.rs` と
  `rmk/src/host/via/vial.rs` から、firmware が応答を組み立てる byte 並びだけを写したもの
- `read-flow.mjs` — vial-gui の `Keyboard.reload()` から、host が read する順序と
  解釈だけを写したもの

両者の endianness や offset の理解が食い違っていれば値が一致しません。あわせて、
再構築した状態が `fixtures/cornix-lp/baseline.vil` と構造的に一致するかも見ています
（layout の形、`-1` になる位置、tap dance / combo / macro の本数、qsid の集合）。

keycode は u16 のまま扱います。u16 と `KC_XXX` 表記の対応表は D-001 の正規化テーブル待ちで、
このSpikeの検証対象ではありません。

## 検証していないこと

- 実機との通信そのもの。transport は R-004、write は R-005 の範囲
- macro buffer の action 単位への分解（NUL 区切りの分解までを見ている）
- definition の xz は `xz` CLI で圧縮・展開している。ブラウザ実装では xz decoder が別途要る
