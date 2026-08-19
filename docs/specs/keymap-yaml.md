# keymap.yaml

Git管理するdesired stateの表現形式の仕様です。schemaの判断はADR 0009にあります。

## 位置づけ

`keymap.yaml`は**`VilDocument`（raw層）の可逆な射影**です。`KeymapView`をmaterializeした
ものではありません。ADR 0006が「状態は`VilDocument`ただ1つ」と決めているため、
`keymap.yaml`が第2のモデルになると状態が二重化します。

| 対象                                | `keymap.yaml`に載るか |
| ----------------------------------- | --------------------- |
| `VilDocument`の全field              | ○（可逆）             |
| definitionとの対応づけ              | ○（ADR 0007のheader） |
| `KeymapView`の解釈結果              | ×                     |
| layer名など`.vil`に無いユーザー情報 | ×（ADR 0009）         |

往復の契約は`parseKeymapYaml(serializeKeymapYaml(doc, binding)).document`が`doc`と
等価であることです。これは`.vil`の意味round-trip（ADR 0001）と合成できます。

## 並べ方

top-level keyの順序は固定です。`layers`と`encoders`はlayerごとのblockで、
**row 1本を1行のflow sequenceに置きます**。

```yaml
schema: cornix-bonsai/keymap@1
keyboard:
  uid: "16882930253541522617"
  name: "Cornix LP"
definition:
  path: "cornix/definitions/49610cdbc2ca7307.json"
  digest: "49610cdbc2ca7307b9495eae003fe6b478882eade97402318fb66206acf869f2"
vial:
  version: 1
  vialProtocol: 6
  viaProtocol: 9
  layoutOptions: -1
layers:
  # layer 0
  - - ["KC_A", -1]
    - ["KC_NO", "0x1234"]
encoders:
  # layer 0
  - - ["KC_VOLD", "KC_VOLU"]
tapDance:
  - ["KC_LANG1", "KC_NO", "KC_LANG2", "KC_NO", 200]
combo:
  - ["KC_A", "KC_B", "KC_NO", "KC_NO", "KC_ESC"]
settings:
  "2": 50
  "27": 130
raw:
  keyOrder: ["version", "uid", "layout", "..."]
  json: |
    { "macro": [], "key_override": [], "alt_repeat_key": [], "unknown": {} }
```

`raw.json`は**Cornix Bonsaiが解釈しないfield**の入れ物です。`macro`・`key_override`・
`alt_repeat_key`・未知のtop-level fieldを、YAMLの構造へ展開せずJSONのまま運びます。
展開すると解釈したことになるためです（ADR 0001）。`raw.keyOrder`は`.vil`のkey順の復元に使います。

## 表記規則

- **keycodeは必ず引用します。** 引用しないとYAMLがhex表記の`0x1234`を整数`4660`として読みます
- **物理キー無しの`-1`は数値のまま置きます。** `KC_NO`（キーはあるが未割り当て）とは別物です
- `uid`は64bit整数なので文字列です（ADR 0001）
- `settings`のkeyはqsidの文字列です。semanticな設定名への対応づけはD-003の範囲で、
  ここではrawのqsidだけを持ちます

## comment

`# layer 0`のようなcommentは**読み手のための注記であって状態ではありません**。
parseは全てのcomment行を捨てます。注記に意味を持たせると`keymap.yaml`が第2の状態になります。

<!-- @code src/core/keymap-yaml/serialize.ts#serializeKeymapYaml -->

## serializeKeymapYaml

raw ドキュメントと`DefinitionBinding`を`keymap.yaml`テキストへ書き出します。

`VilDocument`の全fieldを出力します。1キーの変更が1行のdiffになることが採用理由なので、
その性質はtestで契約として押さえています。

<!-- @code src/core/keymap-yaml/parse.ts#parseKeymapYaml -->

## parseKeymapYaml

`keymap.yaml`テキストを`VilDocument`と`DefinitionBinding`へ読み込みます。

**汎用のYAML parserではありません。** `serializeKeymapYaml`が出す部分集合だけを受け付け、
それ以外は`KeymapYamlParseError`で落とします。desired stateを黙って読み違えるより、
読めないことを大きな声で言うほうが安全だからです（ADR 0009）。

部分集合に限れるので、flow sequence 1行はそのまま`JSON.parse`に通せます。汎用YAMLの
alias・anchor・複数documentなどを解釈する必要がありません。

arityも検査します。`tapDance`が5要素でない、`combo`が文字列5個でない、encoderに数値が
混ざっている場合は、通してから後段のvalidationに任せるのではなくparse時点で落とします。
