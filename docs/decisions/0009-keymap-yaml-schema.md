# `keymap.yaml`はSemantic Modelではなくrawの可逆な射影として定義する

状態: 採用

2026-08-19に、`fixtures/cornix-lp/baseline.vil`と`edge-cases.vil`を入力とする
候補schemaの比較（Spike: `spikes/d-002-keymap-yaml/`）と、`src/core/keymap-yaml/`の
実装・testで往復が成立することを確認して決めた。

## 背景

Git管理するdesired stateとして使う`keymap.yaml`のschemaを決める。

ADR 0006が「状態は`VilDocument`（raw層）ただ1つで、意味表現は保存も比較の正ともしない
派生ビュー」と決めている。したがってD-002が最初に答えるべきなのは表現の細部ではなく、
**`keymap.yaml`が何の射影なのか**である。ここを`KeymapView`の側に置くと、
Git上のdesired stateとrawという2つの状態ができ、ADR 0006が消したはずの二重化が戻る。

制約として確定済みの事実は以下。

- keycodeは正規化せず入力表記のまま保持する。正準形へ畳むとdiffのS/N比が下がる（ADR 0001）
- 未知のtop-level fieldとネストしたfieldはrawのまま持ち回る（ADR 0001）
- `uid`は64bit整数で、数値として扱うと別のキーボードを指すidになる（ADR 0001）
- 保証するのは意味round-tripであってbyte一致ではない（ADR 0001）
- `keymap.yaml`の先頭にkeyboard uidとdefinition digestの対応づけheaderを置く（ADR 0007）
- `USERnn`の意味はdefinitionの定義順で決まる。同じ`USER01`が別のkeycodeを指す
  definitionが実在する（ADR 0002）

## 選択肢

### 何の射影にするか

1. `KeymapView`をmaterializeして書き出し、読み込み時にrawへ逆変換する
2. `VilDocument`の可逆な射影として書き出す。解釈結果は載せない

### どう並べるか（案2を採る場合）

- 案A: raw JSONの構造をそのままblock styleのYAMLへ写す
- 案B: layerごとのblock、rowをflow sequenceで1行に置く
- 案C: 位置をkeyにして1キー1行に置く（`L0.r0.c0: KC_A`）

## 決定

**射影は案2、並べ方は案B**を採る。

- `keymap.yaml`は`VilDocument`の全fieldを載せた可逆な射影とする。往復の契約は
  `parseKeymapYaml(serializeKeymapYaml(doc, binding)).document`が`doc`と等価であること。
  これは`.vil`の意味round-trip（ADR 0001）と合成できる
- `layers` / `encoders`は**row 1本を1行のflow sequence**に置く
- **keycodeは必ず引用する。** 物理キー無しの`-1`は数値のまま置き、`KC_NO`と型で区別する
- `macro` / `key_override` / `alt_repeat_key` / 未知fieldは`raw.json`のblock scalarへ
  **JSONのまま**入れる。YAMLの構造へ展開すると解釈したことになる
- `settings`はqsidの文字列をkeyに持つ。semanticな設定名への対応づけはD-003の範囲とし、
  ここには持ち込まない
- **`.vil`に無いユーザー情報（layer名・キーの説明など）はv1では載せない。** 載せると
  `keymap.yaml`が第2の状態になり、ADR 0006の前提が崩れる
- 読みやすさは**注記のcomment**で足す。commentはparseで捨て、往復の対象にしない
- parserは**汎用YAMLではなく、emitterが出す部分集合だけを受け付ける**strict parserとする。
  部分集合の外はerrorにして、黙って読み違えない

## 理由

### 射影を`KeymapView`側に置かない理由

`KeymapView`はdefinitionを引数に取る派生値で、definitionが変われば同じrawから別の意味が出る
（ADR 0002の`USERnn`）。意味表現をGitに置くと、definition更新のたびにdesired stateの
意味が動き、しかも動いたことがdiffに現れない。rawを置けば、definition側の変更は
`definition.digest`の1行のdiffとして現れる。

### 案Bを採る理由（`baseline.vil`での実測）

| 案  | 全体行数 | 1キー変更のdiff行数 | layer追加のdiff行数 |
| --- | -------- | ------------------- | ------------------- |
| A   | 659      | 2                   | 65                  |
| B   | 99       | 2                   | 9                   |
| C   | 569      | 2                   | 56                  |

1キー変更のdiffは3案とも2行で差がつかない。差がつくのは全体行数で、案Bは案A・案Cの
6分の1以下になる。**案Bだけがrowを1行に保つため、diffのhunkに物理配列の格子が残る。**
案Cは位置がkeyになるので順序に依存しない利点があるが、569行のflat listになり、
どのキーがどこにあるかを人間もAIも読み取れない。

### strict parserにする理由

desired stateはApplyの入力で、読み違えれば実機へ間違った値が書かれる。汎用YAML parserは
書き方の揺れを吸収する方向に働くが、ここで欲しいのは逆で、**想定外の書き方は
読まずに落とす**ことである。部分集合に限れば、flow sequence 1行をそのまま`JSON.parse`に
通せるので、alias・anchor・複数documentなどを解釈する必要が無く、依存も増えない。

## 影響

- **YAMLのlibrary依存を追加しない。** 代わりに、手で書いたYAMLがCornix Bonsaiの
  部分集合から外れると読めない。AIエージェントやCLIが編集する場合は、
  emitterが出す形を保つ必要がある
- layer名を持てないため、layerの識別はindexとcommentだけになる。名前を持たせるには
  ADR 0006の「状態はraw 1つ」をraw + sidecarへ広げる判断が別途要る
- `macro`を`raw.json`へ入れたため、macroの編集はYAML上ではJSONの編集になる。
  macroのsemanticな表現はこのADRの範囲外
- `settings`のqsidが生のまま出るので、D-003が意味名への対応づけを決めるまで
  `keymap.yaml`のsettings部分は人間に読めない
- schema識別子`cornix-bonsai/keymap@1`を持つ。互換性の無い変更でだけ上げ、
  未知のschemaは読まずに落とす
