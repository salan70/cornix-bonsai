# R-002 Spike: Cornix LPの物理配列とVial matrixの対応

keyboard definition (`vial.json`) のKLEを展開し、`(row, col)`と物理座標の対応を出すための
使い捨てコードです。本実装ではありません。判断の結果は
`docs/decisions/0002-keyboard-definition-source.md`にあります。

## 実行

```bash
nix develop -c node spikes/r-002-cornix-lp-matrix/matrix-map.mjs
```

`fixtures/cornix-lp/vial-definition-v1.12.json`を展開し、対応表を出したうえで
`fixtures/cornix-lp/baseline.vil`と矛盾がないかを検証します。

## keyboard definitionの取り出し手順

Vialはkeyboard definitionを実機から受け取ります（`CMD_VIAL_GET_DEFINITION`でxz圧縮された
JSONを分割取得する）。RMKはそれをfirmwareへ埋め込むため、配布UF2から同じJSONを取り出せます。

```bash
# https://github.com/PandaKBLab/Cornix-Split-Low-Profile-Wireless-Keyboard から
# firmwareV1.12.zip を取得して展開する
python3 extract-definition.py cornix-left.uf2 > vial-definition-v1.12.json
```

`extract-definition.py`はこのディレクトリにあります。UF2をflat binaryへ戻し、
xzのmagic (`fd 37 7a 58 5a`) を走査して`"matrix"`を含むJSONが取れる位置を採用します。
右手側UF2にdefinitionは入っていません（peripheral側はVialに応答しない）。

## 突き合わせに使った外部ソース

- vial-gui `src/main/python/kle_serial.py`: KLEのlabel並べ替え (`labelMap`) と幾何の展開
- vial-gui `src/main/python/protocol/keyboard_comm.py`: definitionからkey / encoderを分類する条件、
  `layout_options`の読み出し条件
- vial-gui `src/main/python/widgets/keyboard_widget.py`: encoder directionの表示
- RMK `rmk/src/host/via/vial.rs`: `GetEncoder` / `SetEncoder`のdirection順
- vial-qmk `quantum/vial.c`: 同上（RMKと同順であることの確認）
