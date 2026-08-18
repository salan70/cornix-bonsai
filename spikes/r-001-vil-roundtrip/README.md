# R-001 Spike: `.vil` round-trip

`.vil` → 内部モデル → `.vil` の round-trip を確認するための使い捨てコードです。
本実装ではありません。判断の結果は`docs/decisions/0001-vil-round-trip.md`にあります。

## 実行

```bash
nix develop -c node spikes/r-001-vil-roundtrip/roundtrip.mjs
```

引数なしで`fixtures/cornix-lp/baseline.vil`と`edge-cases.vil`を検証します。
`.vil`のpathを引数で渡すこともできます。

## fixture

- `edge-cases.vil`: 未知のtop-level field、未知のネストfield、非ASCIIのmacro text、
  hex表記のkeycode、`key_override` / `alt_repeat_key`を含む合成fixture

## keycode正規化の確認手順

Vial本体のkeycode解決ロジックは、vial-guiのpythonソースを直接使って確認しました。

```bash
pip install simpleeval
# vial-gui から src/main/python/{keycodes/*.py,any_keycode.py} を取得し、
# Keycode.normalize(kc) == Keycode.serialize(Keycode.deserialize(kc)) を評価する
```

`recreate_keyboard_keycodes(keyboard)`が`MO(n)` / `LT n(kc)` / `TD(n)` / `M(n)`を
layer数・macro数・tap dance数から生成するため、正規化結果はキーボード定義に依存します。
