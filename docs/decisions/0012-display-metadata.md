# layer名などの表示用メタデータは`.vil`に混ぜず、Apply対象外のsidecarへ置く

状態: 採用

2026-08-19に、D-006のUI設計中に「layer名を表示に使う」ことが確定したため、
ADR 0009が持ち越した論点として決めた。実装は行っていない。実機操作も行っていない。

## 背景

要件は「Layer番号より名称を優先する」であり、ADR 0011は`MO(2)`を「Nav」と表示すると決めた。
`describeKeycode`の実出力は`押している間だけ layer 2`であり、名前はCoreの外から与える必要がある。

一方でADR 0009は`keymap.yaml`について次を決めている。

> `.vil`に無いユーザー情報（layer名・キーの説明など）はv1では載せない。載せると
> `keymap.yaml`が第2の状態になり、ADR 0006の前提が崩れる

同ADRは影響節で、名前を持たせるなら「ADR 0006の『状態はraw 1つ』をraw + sidecarへ
広げる判断が別途要る」と明示して先送りしている。D-006がその判断を要求した地点である。

制約は以下。

- 唯一のmutable stateは`VilDocument`で、Semantic Modelはdefinitionを引数に取る派生view（ADR 0006）
- semantic diffの判定はrawで行う（ADR 0010）
- `WRITE_COMMANDS`は単一entryのcommand5種類しか持たない。名前を書ける先が実機に無い（ADR 0008）
- workspaceはユーザーが選んだ1ディレクトリで、`cornix/`配下の配置は確定済み（ADR 0007）

## 選択肢

1. layer名を持たず、UIも`layer 2`と表示する
2. `keymap.yaml`にlayer名の欄を足す
3. `.vil`の未知fieldとしてlayer名を埋め込む
4. Apply対象外の**表示用sidecar**をworkspaceへ置き、UIとrenderingだけが読む

## 決定

案4を採る。

- ファイルは`cornix/labels.yaml`。Git管理対象とする
- 内容は**layer名だけ**とする。キーの説明・色・グループなどは今回入れない
- keyはlayer index、valueは表示名

  ```yaml
  schema: cornix-bonsai/labels@1
  layers:
    0: Base
    1: Num
    2: Nav
    3: Sym
    4: System
  ```

- **このファイルはvalidation・diff・Applyのいずれの入力にもしない。**
  `src/core/`はこのファイルを知らない。読むのはUIとrenderer（SVG / PDF export）だけ
- 名前が無いlayerは`layer 5`のように**indexをそのまま出す**。名前で番号を隠さない
- ファイルが無い、壊れている、layer数と食い違う、のいずれでもUIは動く。
  名前が引けなければindexへ落ちるだけとする

## 理由

- 案1は要件を満たさない。10 layerのkeymapで`MO(2)`と`MO(3)`を番号だけで見分けるのは、
  Overviewと差分確認の両方で実際に読みづらい
- 案2は`keymap.yaml`をrawの可逆な射影でなくする。ADR 0009の射影性が崩れると、
  `.vil`との往復が「名前をどこへ落とすか」の問題を抱える
- 案3は`.vil`のround-tripに乗ってしまい、Vial GUIなど他のtoolへ持ち出したときに
  Cornix Bonsai固有のfieldが付いて回る。ADR 0001が未知fieldを素通しすると決めているのは
  他人のfieldを壊さないためであって、自分のfieldを増やすためではない
- 案4がADR 0006を壊さないのは、sidecarが**stateではない**からである。
  `VilDocument`はデバイスへ書ける情報の全体であり、sidecarはそこに無い表示上の別名でしかない。
  実機へ書く経路も、diffで比較する経路も持たない
- 名前が無いときにindexへ落とすのは、sidecarが欠けたworkspaceでもUIが成立する必要があるためである。
  Git cloneした直後や、AIエージェントが`keymap.yaml`だけ生成した場合に起きる

## 影響

- workspaceの構成にファイルが1つ増える（ADR 0007の配置へ追加）

  ```text
  <workspace>/
    keymap.yaml
    cornix/
      labels.yaml               # 追加。Git管理
      definitions/<digest>.json
      backups/<時刻>.json
      generated/
  ```

- layer名の変更は`keymap.yaml`のdiffに出ない。Gitの履歴上は別ファイルの変更になる
- `describeKeycode`はlayer名を知らないため、UIは戻り値の`layer N`を名前へ置換するのではなく、
  **keycodeから直接layer indexを取って自分で表示文字列を組む**必要がある。
  表示文字列の生成がCoreとUIの2か所に分かれる
- layer名がsidecarにあるため、`.vil` exportとVial GUIへ持ち出したときに名前は失われる。
  これは意図した結果であり、UIで警告しない
- 名前の重複・空文字を許すかを決めていない。UIで名前が衝突したときの見分けは未検討
