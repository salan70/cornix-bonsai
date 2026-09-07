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
