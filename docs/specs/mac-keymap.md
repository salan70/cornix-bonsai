# Mac keyboard

MacBook内蔵キーボードのdesired stateと、Karabiner-Elementsへの生成・適用の仕様です。
判断はADR 0022（Karabinerをengineとする）とADR 0023（keycode構文層）にあります。

Cornix LP向けの`keymap.yaml`とは**別のdevice class**です。Apple製キーボードには
firmwareのkeymapが無く、matrix・keyboard definition・実機申告の容量・WebHIDという
`VilDocument`側の前提が1つも成立しません。したがって`VilDocument`へ寄せず、
`src/core/keycode/table.ts`の`createKeycodeTable`も使いません。

## 位置づけ

```text
mac-keyboard.yaml            desired state（Git管理、workspace直下）
  ↓ parseMacKeymapYaml
MacKeymapDocument            layer番号 → (Karabinerのkey_code名 → QMK表記)
```

位置の識別はKarabinerの`key_code`名です。matrixのrow / colを持ちません。
Karabinerは書かれていないキーを素通しするため、**割り当ての無いキーは書きません**。
layer番号も`key_code`名も疎で、連続している必要はありません。

<!-- @code src/core/mac-keymap/types.ts#MacKeymapDocument -->

## MacKeymapDocument

desired stateの内容です。schema識別子は`cornix-bonsai/mac-keymap@1`で、
`keymap.yaml`の`cornix-bonsai/keymap@1`とは別系統です。

`profile`はCornixが所有するKarabiner profileの名前です。`karabiner.json`の`profiles[]`の
うちこの名前の1個だけを書き換え、`global`と他のprofile、`selected`には触りません。

`layout`は対象マシンの内蔵キーボードの物理配列（`ansi` / `jis`）です。fromキーの妥当性が
物理配列に依存するため（US配列に`japanese_kana`は無い）、keymapの前提条件として宣言します
（ADR 0024）。YAMLでは省略でき、省略時は`jis`です。型の上では必須で、既定値を埋めるのは
parseだけの責務です。

<!-- @code src/core/mac-keymap/serialize.ts#serializeMacKeymapYaml -->

## serializeMacKeymapYaml

`mac-keyboard.yaml`のテキストを組み立てます。

```text
schema: cornix-bonsai/mac-keymap@1
layout: jis
profile: "Cornix Bonsai"
layers:
  0:
    "caps_lock": "LCTL_T(KC_ESC)"
    "japanese_kana": "LT1(KC_LANG1)"
  1:
    "h": "KC_LEFT"
```

並べ方は`cornix/labels.yaml`と同じく、section見出しの下へ`key: "value"`を1行ずつ置く形です。
`keymap.yaml`のserializerは物理配列の格子をdiffのhunkへ残すためにrowをflow sequenceで
並べますが（ADR 0009）、こちらは疎なmapなので格子がありません。

並び順はlayer昇順・`key_code`名昇順で固定します。生成器がmanipulatorを並べる規則と
同じにして、手で並べ替えてもdiffが動かないようにします。

`layout`行は省略時の既定があっても**常に**書き出します。正規形は明示です（ADR 0024）。

<!-- @code src/core/mac-keymap/parse.ts#parseMacKeymapYaml -->

## parseMacKeymapYaml

**汎用のYAML parserではありません。** `serializeMacKeymapYaml`が出す部分集合だけを受け付け、
それ以外は`MacKeymapParseError`で落とします。desired stateを黙って読み違えるより、
読めないことを大きな声で言うほうが安全なためです（ADR 0009と同じ理由）。

受け付ける形はインデントの深さで決まります。2がlayer番号、4が割り当てです。
値は`JSON.stringify` / `JSON.parse`で引用します。schemaが一致しない、layer番号が重複する、
同じlayerで`key_code`が重複する、`profile`が無い場合はすべて落とします。
`layout`は省略なら`jis`、`ansi` / `jis`以外の値なら落とします（ADR 0024）。

`parse(serialize(x))`が`x`と等しくなることを`fixtures/mac-keyboard/desired.yaml`で検証します。

<!-- @code src/core/mac-keymap/karabiner.ts#KarabinerConfig -->

## KarabinerConfig

`karabiner.json`のうち、Cornixが読み書きする範囲だけに型を付けたものです。`global`や
所有しないprofileの中身は解釈せず`unknown`のまま持ち回ります。解釈すると、Karabinerが
増やしたfieldを書き戻しで落とす経路ができるためです（ADR 0001と同じ理由）。

`to`を持たないmanipulatorは**イベントを捨てます**。`KC_NO`はこれで表します。

<!-- @code src/core/mac-keymap/key-codes.ts#karabinerKeyCode -->

## karabinerKeyCode

QMK表記をKarabinerの`key_code`へ写します。表のkeyは`canonicalKeycode`が返す長い表記で持ち、
引く前に必ず畳みます。`classifyKeycode`の語彙が長い表記を正としているためです
（ADR 0001・0010）。

**この表は閉じています。** 載っていない表記は`mac-keymap/unsupported-keycode`（error）に
なります。Vial側の`reference/unknown-keycode`がwarningなのは実機が解釈するからで、
Karabinerは生成器が落とせなければ機能そのものが無くなるためseverityが違います（ADR 0023）。

位置として書ける`key_code`名は`KARABINER_POSITIONS`です。表の値に、QMK側へ対応の無い
MacBookの`fn`を足したものです。

語彙として正当でも、宣言した物理配列に存在しない位置は`LAYOUT_MISSING_POSITIONS`
（`KARABINER_POSITIONS`の部分集合）で判定し、`mac-keymap/position-not-on-layout`（warning）に
します。`ansi`側の集合はFact（`japanese_kana` / `japanese_eisuu`、実機確認）とInference
（`international*` / `non_us_*`、HID usageの定義上ANSIに対応キーが無い）を区別して持ち、
`jis`側は実機Factが無いため空です（ADR 0024）。

<!-- @code src/core/mac-keymap/generate.ts#generateKarabinerRules -->

## generateKarabinerRules

desired stateからKarabinerのrulesを組み立てます。展開規則はADR 0022、構文層の出どころは
ADR 0023です。`classifyKeycode`が返す`KeycodeLexeme`から直接写します。

| `KeycodeLexeme`             | Karabiner                                                    |
| --------------------------- | ------------------------------------------------------------ |
| `transparent`               | manipulatorを出さない                                        |
| `none`                      | `to`を持たないmanipulator                                    |
| `basic`                     | `to: [{ key_code }]`                                         |
| `layerSwitch` / `momentary` | `set_variable 1` + `to_after_key_up`で`set_variable 0`       |
| `layerSwitch` / `layerTap`  | 上記 + `to_if_alone`                                         |
| `layerSwitch` / `toggle`    | `variable_if` / `variable_unless`で分岐した2本               |
| `modTap`                    | `to: [{ key_code: <modifier>, lazy: true }]` + `to_if_alone` |
| それ以外                    | error diagnostic                                             |

規則のうち、順序と省略が意味を持つものは以下です。

- **ruleはlayer降順に出します。** ruleは上から評価され最初にマッチしたものが勝つため、
  逆順にするとlayer 0の割り当てが上のlayerを食います
- **`TG(n)`は倒す側を先に置きます。** 順序を逆にすると押した直後に立て直します
- **manipulatorを出さないのは2つだけです。** `KC_TRNS`と、layer 0と同値のキー。
  Karabinerは書かれていないキーを素通しするため、出さないことがそのまま正しい挙動です
- mod-tapの`to`には`lazy`を付けます。付けないとhold側のmodifierが単独で発火します
- 全manipulatorの`conditions[0]`は`device_if`の`is_built_in_keyboard`です
- `from`には`modifiers: { optional: ["any"] }`を付け、修飾キーを素通しさせます
- manipulatorが1つも出ないlayerはruleごと省略します

`key_code`名の昇順で並べます。生成物が入力の書き順に依存しないようにするためです。

<!-- @code src/core/mac-keymap/generate.ts#generateKarabinerAsset -->

## generateKarabinerAsset

`karabiner_cli --lint-complex-modifications`が受け取るasset形式（`{ title, rules }`）です。
Browser UIとCLIの`cornix mac generate`はこの形を`cornix/generated/`へ書き出します。

`karabiner_cli`は**エラーがあってもexit codeを0で返します**。判定は出力が`: ok`で
終わるかどうかで行います。

<!-- @code src/core/mac-keymap/generate.ts#generateCornixProfile -->

## generateCornixProfile

`karabiner.json`の`profiles[]`へ差し込むprofile 1個です。Cornixが所有する唯一の範囲で、
`selected`も`simple_modifications`も持たせません。profileの切り替えはユーザーの操作です
（ADR 0022）。

`virtual_hid_keyboard.keyboard_type_v2`はdocumentの`layout`から導出します。
`MacKeyboardLayout`の値はKarabinerの語彙と一致するため写像表を持ちません（ADR 0024）。

<!-- @code src/core/mac-keymap/validate.ts#validateMacKeymap -->

## validateMacKeymap

desired stateの検証の入口です。`validation/validate.ts`の`validateKeymap`は`VilDocument`と
`KeyboardDefinition`を前提にするため使えません。合成の入口をMac側に別途置きます（ADR 0022）。

severityの判定規則はADR 0010のままです。Karabinerへ落とせず**機能そのものが無くなる**
ものはerror、割り当てが1件単位で静かに失われるものはwarning、情報が保持されていて判断を
ユーザーへ委ねられるものはinformationにします（ADR 0024）。

| code                                     | severity    | 事実                                            |
| ---------------------------------------- | ----------- | ----------------------------------------------- |
| `mac-keymap/unknown-position`            | error       | Karabinerの`key_code`に無い位置。lintを通らない |
| `mac-keymap/unsupported-keycode`         | error       | 対応する`key_code`が無い、または落とせない構文  |
| `mac-keymap/unsupported-mod-tap`         | error       | mod-tapのmodifierかtap側を落とせない            |
| `mac-keymap/unsupported-layer-tap-inner` | error       | `LT`のtap側を落とせない                         |
| `mac-keymap/position-not-on-layout`      | warning     | 宣言した配列に無いfromキー。決して発火しない    |
| `mac-keymap/unknown-layer`               | warning     | 書かれていないlayerを指す`MO` / `LT` / `TG`     |
| `mac-keymap/unreachable-layer`           | information | layer 0から辿り着くkeycodeが無い                |

到達性は`analyzeLayerGraph`を共有します。Vial側の`reachability/trapped-layer`は
見ません。Karabinerではlayer 0のmanipulatorが変数の状態に関わらず常に効くため、
`TG(n)`を置いたキーが上のlayerで潰されていない限り出口は必ずあります。

## 適用の境界

`src/core/mac-keymap/`はfilesystemに触りません。`karabiner.json`のread / backup / writeは
`src/karabiner/node.ts`が担います。`~/.config/karabiner/karabiner.json`は**workspaceの外**に
あり、`NodeWorkspaceStore`はpathを`root`からの相対で解決するため使えません。

ADR 0008の状態機械（`src/core/apply/plan.ts`）は**再利用しません**。あちらは実機への
往復するwriteを扱い「部分的に書けた状態」からの復旧を型で表しますが、こちらは1ファイルの
atomic置換なのでその状態が原理的に生じません（ADR 0022）。

backupは**読んだテキストをそのまま**書き戻します。再serializeするとKarabiner独自の整形が
落ち、復元しても元のファイルと同じになりません。置き場所は
`cornix/backups/karabiner-<時刻>.json`です。

書き込みは同じディレクトリのtempへ書いてから`rename`します。Karabinerは設定ファイルの親
ディレクトリをwatchして自動reloadするため、途中まで書けたファイルを見せません。`rename`は
同じfilesystemでなければatomicにならないので、tempを置き換え先と同じディレクトリに作ります。

<!-- @code src/core/mac-keymap/apply.ts#planMacApply -->

## planMacApply

`karabiner.json`の内容とdesired stateから適用計画を組みます。writeは行いません。

Cornixが所有するのは`profiles[]`のうち名前が一致する**profile 1個だけ**です。`global`と
他のprofileには触りません。所有profileが無ければ末尾へ足します。

所有profileが持っていた`selected`などのfieldは残します。生成するprofileは`selected`を
持たないため、丸ごと置き換えると選択状態を落とします。選択されていない場合は
`mac-keymap/profile-not-selected`（warning）を出し、`karabiner_cli --select-profile`を
案内します。profileの切り替えはユーザーの操作です（ADR 0022）。

`fingerprint`は人間の確認と適用を結びつける同一性の指紋です。表示用ではありません。
CLIの`cornix mac apply`は`--confirm <fingerprint>`が一致したときだけ書き込みます。

<!-- @code src/core/mac-keymap/apply.ts#diffOwnedProfile -->

## diffOwnedProfile

所有profileのmanipulatorを**構造で**突き合わせます。位置はruleのdescriptionと`from`の
`key_code`、同じキーの中の順番で指します。

**テキストでは比較しません。** `karabiner_cli --format-json`が独自整形でファイルを
書き換えるため、テキスト比較では毎回「変更あり」になります（D-007で実証済み）。ここで
比較するのはparse済みの値で、objectのkey順は正規化してから突き合わせます。

<!-- @code src/core/mac-keymap/apply.ts#verifyMacApply -->

## verifyMacApply

適用後に読み直したconfigが期待どおりかを構造で確かめます。所有profileが存在し、
`diffOwnedProfile`の差分が空であることが成功の条件です。
