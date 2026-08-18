# 2026-08-18 R-002 Cornix LPの物理配列とVial matrixの対応調査

対象Issue: #2 `[R-002] Cornix LPの物理配列とVial matrixの対応を整理する`

## 調査方法

- 公式配布firmware（PandaKBLab/Cornix-Split-Low-Profile-Wireless-Keyboard の
  `firmwareV1.6` / `1.7` / `1.10` / `1.11` / `1.12`）のUF2からkeyboard definitionを取り出し、
  version間で差分を取った
- vial-guiの`kle_serial.py`・`protocol/keyboard_comm.py`・`widgets/keyboard_widget.py`を読み、
  definitionの解釈規則を確認した
- RMK `rmk/src/host/via/vial.rs`とvial-qmk `quantum/vial.c`でencoder directionの順を確認した
- 取り出したdefinitionと実export（`fixtures/cornix-lp/baseline.vil`）をSpikeで突き合わせた
- コミュニティ製のCornix向けdefinition 3件（dovahcrow / adong660 / cffnpwr）と比較した

## Fact

### keyboard definition

- Vialはkeyboard definitionを実機から取得する（`CMD_VIAL_GET_DEFINITION`、xz圧縮JSON）。
  Cornix LPの公式firmwareはRMK製で、definitionをfirmwareへ埋め込んでいる
- 公式definitionは`name: "HID Keyboard"` / `vendorId: 0xE118` / `productId: 0x0001`。
  Vial GUIが表示する名前はUSB product stringであり、この`name`ではない
- `matrix`は`{"rows": 8, "cols": 7}`。物理キーは50（48キー＋knob押下2）
- V1.6〜V1.12で`layouts.keymap`は完全に同一。matrix対応はこの範囲でfirmware versionに依存しない
- `customKeycodes`は8個で、定義順がそのまま`USER00`〜`USER07`になる:
  `BT0, BT1, BT2, NEXT_BT, PREV_BT, CLR_BT, SWITCH, CLR_PEER`
- コミュニティ製definitionは`layouts.keymap`が別物（dovahcrowは`matrix`が4x14）か、
  `customKeycodes`が9〜12個で順序も違う（adong660 / cffnpwrは`BT0`〜`BT4`が先頭）。
  `layouts.keymap`自体はadong660とcffnpwrで一致するが、公式のものとは一致しない
- 右手側UF2にdefinitionは入っていない

### matrix対応

- row 0〜3が左手、row 4〜7が右手。col 0が外側（小指側）、col 5が内側（人差し指側）で、
  左右とも同じ向き。つまり右手側は物理x座標に対してcolが逆順に並ぶ
- col 6はrow 2とrow 5にだけ存在し、knobの押下スイッチ。row 2（左）とrow 5（右）
- 各半分は「row 0〜2 × col 0〜5」の18キーに加え、row 3（またはrow 7）が
  col 0〜2の最下段3キーとcol 3〜5の親指3キーを兼ねる
- 対応表と物理座標は`nix develop -c node spikes/r-002-cornix-lp-matrix/matrix-map.mjs`で生成する。
  ここに転記しない（definitionが唯一の定義元）
- `.vil`の`layout`で`-1`になっている位置の集合は、definitionが定義する`(row, col)`の
  補集合と完全に一致した（10 layer × 8 × 7で不一致0）

### 配列上の特殊事項

- 親指の外側2キー（左`(3,4)` `(3,5)`、右`(7,4)` `(7,5)`）はKLEの回転キー。
  `r` / `rx` / `ry`を持ち、格納された`x` / `y`は回転前の値。実際の位置は
  `(rx, ry)`を中心に`r`度回した後の座標になる
- 右手側の`(7,5)`は`rx` / `ry`が左手側のcluster原点（5, 4.75）のまま`r: -23`で定義されており、
  格納値`x=7.64, y=5.38`は回転前の座標。回転後は左右ほぼ対称（誤差0.03u以下）に収まる
- 各列は縦方向にstaggerしている（col 3が最も上、col 0とcol 5が最も下）
- `(0,0)`のKLE labelに`"1"`という文字列がある。align=4のlabelMapでは`labels[10]`
  （前面左）へ写るため、matrix座標にもlayout optionにも影響しない
- encoderは2基。definition上の座標はx=15.25〜18.75で、盤面の右外に並べて置かれており、
  物理的なknob位置（`(2,6)`のx=6.5、`(5,6)`のx=8.0）とは対応しない
- `.vil`の`encoder_layout[layer][idx]`は`[direction 0, direction 1]`で、
  **direction 0 = 反時計回り (CCW)、direction 1 = 時計回り (CW)**。
  RMKの`GetEncoder`が`input_data[0..2]`にcounter_clockwiseを書き、vial-guiが
  それをdirection 0として読むため。vial-qmkの`vial_get_encoder`も同順。
  vial-guiの`save_layout`はこの2つを`cw` / `ccw`という変数名で扱っているが、
  変数名が実態と逆で、`keyboard_widget.py`の描画（dir 0を反時計回りの矢印にする）が正しい

### `layout_options`

- 公式firmwareの`layouts.labels`はV1.10で追加された。中身は
  `[["Firmware Version", "V1.10"]]`のような**firmware versionの表示専用**の1グループで、
  V1.11 / V1.12ではその文字列だけが変わる（definitionの他の差分はゼロ）
- 選択肢が1つしかないグループなので、取りうる値は0だけ
- `layouts.keymap`のどのキーもlayout option指定（KLE labelの`labels[8]`にある`"index,option"`）を
  持たない。つまりlayout_optionsをどう変えても表示・有効なキーは一切変わらない
- vial-guiは`layouts.labels`がある場合だけ実機から`VIA_LAYOUT_OPTIONS`を読む。
  無い場合`layout_options`は初期値`-1`のまま`.vil`へ書き出される
  （v0.7 / v0.7.1 / mainで同じ実装）
- `fixtures/cornix-lp/baseline.vil`の`layout_options`は`0`。したがってこの実機の
  firmwareはV1.10以降である
- `restore_layout`は`set_layout_options`を呼ぶが、`self.layout_options == -1`のときは
  何も書かない。V1.6 / V1.7のfirmwareへV1.10以降の`.vil`を渡しても実害はない

## Spike結果

`spikes/r-002-cornix-lp-matrix/`

- `extract-definition.py`: 配布UF2 → flat binary → xz streamの走査でdefinitionを取り出す。
  V1.12の抽出結果は`fixtures/cornix-lp/vial-definition-v1.12.json`とbyte一致
- `matrix-map.mjs`: vial-guiと同じKLE展開でdefinitionを解き、対応表を出したうえで
  `baseline.vil`と突き合わせる。物理キー数50、encoder 2基、`-1`位置の一致、
  matrix形状の一致、layout option未使用、`layout_options == 0`をすべて確認した

## Inference

- ~~encoder 0が左手、encoder 1が右手~~ → **2026-08-18の実機確認でFactになった**。
  layer 0で左のknobを回すと音量が動く（実機のencoder 0は`KC_VOLD` / `KC_VOLU`）。
  詳細は`2026-08-18_r-004-webhid-macos.md`
- 左右の別はrow番号で決まる（0〜3が左）が、これはdefinitionの物理x座標から読み取った結果であり、
  definitionが変わればこの前提も変わる。renderingはrow番号ではなく座標を使うべき
- `layouts.labels`をfirmware versionの表示に流用しているのは公式firmware側の設計で、
  Vialの想定した使い方ではない。将来のfirmwareでこれが本来のlayout optionに変わる可能性は低いが、
  「labelsがある＝layout optionがある」と解釈するコードは書かない方がよい

## Decision

ADR `docs/decisions/0002-keyboard-definition-source.md` に記録した。
keyboard definitionを実機由来の入力データとして扱い、matrix対応・encoder数・
custom keycodeの意味をそこから導出する。配列をコードにhard-codeしない。

## Open Question

- encoder indexと左右の対応は実機で未確認。R-003で`.vil`と実機readを突き合わせる際に確認する
- ユーザーの実機firmware versionが未確定。`layout_options == 0`からV1.10以降とまでは言えるが、
  definitionを実機から読めば`layouts.labels`に版が入っている（R-003）
- `settings`のqsidとRMK側の対応は未調査。D-003の入力
- RMKのvial実装がvial-qmkと異なる箇所は`GetEncoder`以外にも存在しうる。
  実機writeの前にR-005で洗う
