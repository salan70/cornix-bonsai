# 2026-08-18 R-003 Vialで完全なdeviceStateを取得するreadフロー

対象Issue: #3 `[R-003] Vialで完全なdeviceStateを取得するreadフローを特定する`

## 調査方法

- vial-guiの`protocol/`一式（`keyboard_comm.py` / `dynamic.py` / `tap_dance.py` /
  `combo.py` / `key_override.py` / `alt_repeat_key.py` / `macro.py` / `constants.py`）と
  `editor/qmk_settings.py` / `resources/base/qmk_settings.json`を読み、
  `Keyboard.reload()`が発行するcommandとその解釈を列挙した
- RMKの`rmk/src/host/via/mod.rs` / `vial.rs` / `keycode_convert.rs`を、
  main（2026-08-18時点）とtag `rmk-v0.8.2`の両方で読み、応答側のbyte並びを確認した
- 両者を独立に写したSpikeで突き合わせ、`fixtures/cornix-lp/baseline.vil`と構造を比較した

## Fact

### readで必要なcommand（vial-guiの`reload()`順）

| 順  | command                                       | 得られるもの                                            |
| --- | --------------------------------------------- | ------------------------------------------------------- |
| 1   | `0x01` GetProtocolVersion                     | `via_protocol`（BE u16）                                |
| 2   | `0xFE 0x00` GetKeyboardId                     | `vial_protocol`（LE u32）、`uid`（LE u64）              |
| 3   | `0xFE 0x01` GetSize                           | definitionのxz圧縮後size（LE u32）                      |
| 4   | `0xFE 0x02` GetDefinition                     | definition本体。32 byte/pageで分割、xz圧縮              |
| 5   | `0x11` GetLayerCount                          | layer数                                                 |
| 6   | `0x0C` / `0x0D` MacroGetCount / GetBufferSize | macro本数、macro buffer長（BE u16）                     |
| 7   | `0xFE 0x09` SettingsQuery                     | 対応qsidの列挙（LE u16の並び、`0xFFFF`で終端）          |
| 8   | `0xFE 0x0A` SettingsGet                       | qsidごとの値。先頭byteが状態、以降LE                    |
| 9   | `0xFE 0x0D 0x00` GetNumberOfEntries           | tap dance / combo / key override / alt repeat keyの本数 |
| 10  | `0x12` KeymapGetBuffer                        | keymap全体。28 byte/回、値はBE u16                      |
| 11  | `0xFE 0x03` GetEncoder                        | `(layer, index)`ごとに`[CCW, CW]`のBE u16               |
| 12  | `0x02 0x02` GetKeyboardValue(LayoutOptions)   | `layouts.labels`がある場合のみ（ADR 0002）              |
| 13  | `0x0E` MacroGetBuffer                         | macro buffer。28 byte/回                                |
| 14  | `0xFE 0x0D 0x01` MorseGet                     | tap dance。本数ぶん                                     |
| 15  | `0xFE 0x0D 0x03` ComboGet                     | combo。本数ぶん                                         |
| 16  | `0xFE 0x0D 0x05` / `0x07`                     | key override / alt repeat key。本数が0なら発行されない  |

- `definition.lighting`が`"none"`のため、Cornix LPではlighting系のread（`0x08`系）は1回も走らない
- Cornix LPの構成での往復数はSpike実測で168回
  （definition 24 / keymap 40 / encoder 20 / tap dance 32 / combo 32 / settings 10 / macro 2 / その他8）。
  definitionのpage数は圧縮後sizeに依存する
- `.vil`のfieldは上記readの結果だけで埋まる。read以外の入力は無い
- keymap bufferのoffsetは`layer * rows * cols * 2 + row * cols * 2 + col * 2`。
  RMK側は`layers`を`flatten()`した順（layer→row→col）で返すため一致する
- `layout`が`-1`になるのは、definitionが宣言していない`(row, col)`。
  実機はそこにも値を返すが、vial-guiはdefinitionが宣言した位置しか拾わない
- unlock（`0xFE 0x05`〜`0x08`）はreadフローに現れない。matrix testerとreset系keycodeのwrite時だけ要る

### 容量は実機が申告する

- tap dance / combo本数は`MORSE_MAX_NUM` / `COMBO_MAX_NUM`、macro bufferは`MACRO_SPACE_SIZE`で、
  いずれもRMKのbuild時config（`keyboard.toml`の`[rmk]`）から生成される定数。
  既定値は8 / 8 / 256だが、実機（`baseline.vil`）は32 / 32
- macro本数だけはRMKが`32`をhard-codeして返す（`DynamicKeymapMacroGetCount`、実装途中）
- key overrideとalt repeat keyはRMK未実装で常に0本。`.vil`でも空配列になる。
  alt repeat keyは`GetNumberOfEntries`の応答`input_data[3]`をRMKが書かないが、
  RMKはrequestをresponse bufferへ複製してから書き換えるため、requestの該当byte（0）が残って0になる
- combo 1件の入力数は`COMBO_MAX_LENGTH`（既定4）。vial-guiは`<HHHHH>`固定で読むため、
  4以外でbuildされたfirmwareとは形式が合わない

### settings（qsid）とRMKの対応

- `baseline.vil`のqsid集合`{2, 6, 7, 18, 19, 22, 23, 26, 27}`は、
  tag `rmk-v0.8.2`の`SettingKey`（`ComboTimeout` / `OneShotTimeout` / `MorseTimeout` /
  `TapInterval` / `TapCapslockInterval` / `PermissiveHold` / `HoldOnOtherKeyPress` /
  `UnilateralTap` / `PriorIdleTime`）と完全に一致する
- RMK mainにはこれに加えて`QuickTapTerm`（0x19 = 25）がある。追加は2026-07-30の
  `a511282c`で、まだどのtagにも入っていない。`baseline.vil`に25が無いことと整合する
- 値はintegerがLE u16、booleanが1 byte。vial-gui側の幅は`qmk_settings.json`が定義元
- vial-guiは自分が知らないqsidをreadしない。RMKが将来qsidを増やしても、
  vial-gui側の対応が無ければ`.vil`には出てこない
- qsid列挙は1往復で終わる。RMKが応答の余りを`0xFF`で埋め、vial-guiが`cur`を
  `0xFFFF`込みで更新するため

### readはVIA表現へのprojectionである

- RMKの`to_via_keycode`は、VIAに対応表現が無い`KeyCode`を`0`（`KC_NO`）へ落とす
  （`Consumer` / `SystemControl`はHID keycodeへ変換できる場合のみ通る）
- したがってreadで得られるのはfirmware内部のkeymapではない。
  read結果をそのまま全buffer writeで書き戻すと、読めなかった状態を消す

### write経路に持ち越す注意（R-005の入力）

- keymapのbulk write（VIA `0x13` `DynamicKeymapSetBuffer`）はRMK側でreadと非対称。
  read（`0x12`）は`offset / 2`をentry indexとしBEで書くが、writeは`offset`を
  そのままentry indexとして扱いLEで読む。main / 0.8.2の双方で同じ。使ってはいけない
- 単発write（`0x05` SetKeyCode、`0xFE 0x04` SetEncoder）はvial-guiとRMKでBE解釈が一致する

## Spike結果

`spikes/r-003-vial-read-flow/`

- `mock-device.mjs`（RMK 0.8.2の応答側）と`read-flow.mjs`（vial-guiのread側）を
  別々の実装から独立に写し、突き合わせた。値の一致は両者の理解が食い違っていないことを意味する
- keymap / encoder / tap dance / combo / settings / macro / uidのすべてで値が一致
- 再構築結果は`baseline.vil`と構造が一致した。layoutの形（10x8x7）、`-1`位置の集合、
  encoder_layoutの形、tap dance / combo / macroの本数、qsid集合、`layout_options`
- definitionが宣言していない位置に実機が値を返しても、再構築結果へ漏れないことを確認した

## Inference

- ユーザーの実機firmware（Cornix LP V1.10以降）はRMK 0.8系でbuildされている。
  根拠はqsid集合が`rmk-v0.8.2`の`SettingKey`と完全一致し、mainにある0x19が無いこと。
  RMKのversionを直接読むcommandは無いため、これ以上は絞れない
- ~~encoder 0が左手、1が右手（ADR 0002のInferenceのまま）~~ → 2026-08-18の実機確認でFactになった。
  下のOpen Questionを参照

## Decision

ADR `docs/decisions/0003-device-read-flow.md` に記録した。
readはvial-guiと同じ順序・解釈で行い、得られたwire値をdeviceStateの定義とする。
比較はu16 keycodeで行い、実機writeは差分writeに限る。

## Open Question

- ~~encoder indexと左右の物理knobの対応が未確認~~ → **解決**（2026-08-18の実機確認）。
  **encoder 0が左手、encoder 1が右手**。実機のencoder 0 layer 0は`0x00AA` / `0x00A9`
  （`KC_VOLD` / `KC_VOLU`）で、左のknobで音量が動くことをユーザーが確認した。
  encoder 1は`0x0150` / `0x014F`（`LCTL(KC_LEFT)` / `LCTL(KC_RIGHT)`）。
  詳細は`2026-08-18_r-004-webhid-macos.md`
- macro bufferをaction単位へ分解する処理（`macro_deserialize_v2`相当）は未実装・未検証。
  `.vil`の`macro` fieldを埋めるのに要る。D-002の入力
- RMKの`to_via_keycode`が落とすKeyActionが、Cornix LPの出荷keymapに実在するかは未確認。
  実在する場合、その位置は常に`KC_NO`としてreadされる
- ~~168往復の所要時間とtimeoutはtransport依存~~ → **解決**。USB 340ms / BLE 7.0s。
  `2026-08-18_r-004-webhid-macos.md`とADR 0004
- 実機readと`baseline.vil`の突き合わせで、keymap 1箇所（layer 3の`(3,2)`が実機`0x00E3` = 左GUI、
  `baseline.vil`は`KC_NO`）とtap dance 2件が食い違った。**`baseline.vil`はexport時点のsnapshotであり、
  現在の実機状態ではない**。fixtureを「現在の実機」と同一視しないこと。
  definition / settings / combo / macro / layout_options / encoderは一致した
