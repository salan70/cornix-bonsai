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

<!-- @code src/core/mac-keymap/serialize.ts#serializeMacKeymapYaml -->

## serializeMacKeymapYaml

`mac-keyboard.yaml`のテキストを組み立てます。

```text
schema: cornix-bonsai/mac-keymap@1
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

<!-- @code src/core/mac-keymap/parse.ts#parseMacKeymapYaml -->

## parseMacKeymapYaml

**汎用のYAML parserではありません。** `serializeMacKeymapYaml`が出す部分集合だけを受け付け、
それ以外は`MacKeymapParseError`で落とします。desired stateを黙って読み違えるより、
読めないことを大きな声で言うほうが安全なためです（ADR 0009と同じ理由）。

受け付ける形はインデントの深さで決まります。2がlayer番号、4が割り当てです。
値は`JSON.stringify` / `JSON.parse`で引用します。schemaが一致しない、layer番号が重複する、
同じlayerで`key_code`が重複する、`profile`が無い場合はすべて落とします。

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
