# Semantic Modelはrawを唯一の状態とし、definitionを引数に取る派生ビューとして構成する

状態: 採用

2026-08-19に、`fixtures/cornix-lp/baseline.vil`と公式firmware V1.12のkeyboard definitionを
入力とする最小実装（`src/core/`）とtestで、境界が成立することを確認して決めた。

## 背景

UI、CLI、analysis、rendering、Git管理設定、Vial adapterが共有する内部表現の境界を決める。

ADR 0001は「rawのJSON構造をそのまま保持し、意味表現は派生ビューとして持つ」を採用済みで、
ADR 0002はkeyboard definitionを単一の定義元と決めている。したがってD-001が決めるのは
**派生ビューの粒度と、definition依存部分の解決責務をどこへ置くか**である。

加えてADR 0001・0002・0003が3回とも「正規化テーブルの単一の定義元が別途要る」を
D-001の入力として先送りしていた。その置き場所を確定させる必要がある。

制約として確定済みの事実は以下。

- `uid`は64bit整数で、素の`JSON.parse`では桁落ちする（ADR 0001）
- keycodeは正規化せず入力表記のまま保持する。正準形へ畳むとsemantic diffのS/N比が下がる（ADR 0001）
- 未知のtop-level fieldとネストしたfieldはrawのまま持ち回る（ADR 0001）
- `customKeycodes`は定義順がそのまま`USER00`, `USER01`, …になる。
  公式firmwareは8個、コミュニティ製は9〜12個で順序も違うため、同じ`USER01`が別のkeycodeを指す（ADR 0002）
- `layouts.labels`は公式firmware V1.10で追加されたが、中身は`[["Firmware Version", "V1.12"]]`で
  firmware versionの表示にしか使われていない（ADR 0002）
- 物理配列はrendering用の派生データであり、`.vil`のround-trip対象ではない（ADR 0002）
- 容量（layer数・macro数・tap dance数・combo数）は実機が申告する。firmware build時に決まるため
  定数にできない（ADR 0003）
- deviceStateはwire値（u16）のモデルで、rawモデルとは別の層になる（ADR 0003）

## 選択肢

1. rawとdefinitionをそのまま持ち回り、意味層の型を持たない。
   `USERnn`の解決も`-1`と`KC_NO`の区別もencoder directionの意味も、利用側がその場で解釈する
2. rawから独立した正規化済みSemantic Modelを構築し、import / exportで双方向変換する（materialize）
3. rawを唯一の状態とし、意味表現は「definitionを引数に取る派生ビュー」と
   「rawを返す意味単位の編集操作」の集合として定義する

## 決定

案3を採る。

- **状態は`VilDocument`（raw層）ただ1つ**とする。意味表現は`buildKeymapView(document, definition)`が
  返す読み取り専用の派生値で、保存もserializeも比較の正ともしない
- 編集は`setKeyAssignment(document, position, keycode)`のように、意味単位の位置指定を受け取って
  rawを返す純関数で行う
- **正規化テーブルは`createKeycodeTable(definition, capacities)`として独立させる**。
  モジュール定数にしない。custom keycodeはdefinitionの定義順で、`MO(n)` / `LT n(kc)` /
  `TD(n)` / `M(n)`の語彙は容量で決まるため、両方を引数に取る
- 解釈できないkeycodeは表記を保ったまま素通しする。QMKの基本keycode語彙を網羅した表は持たない。
  網羅はD-003で扱う。容量の範囲外は範囲外として返し、黙って`KC_NO`へ落とさない
- **物理配列は`toPhysicalLayout(definition)`という別の派生artifact**とし、Semantic Model本体に
  含めない。引数はdefinitionだけで`.vil`を参照しない
- **`layout_options`は`groups`（`layouts.labels`由来、表示用）と`gatesKeys`（物理配列由来、
  キーの出し分け有無）を独立に持つ**。負の値は「Vialが実機から読まなかった」として`0`と区別する。
  exportは常にrawをそのまま書き戻し、解釈結果を参照しない
- 依存方向は`core/vil`・`core/definition` → `core/keycode` → `core/model` → adapterの一方向。
  `src/core/`はReact、filesystem、WebHIDをimportしない

## 理由

- 案1は同じ解釈が利用側の数だけ複製される。ADR 0002が禁じたhard-codeが、コード内テーブルではなく
  **各call siteの暗黙の前提**という形で復活する。validationとsemantic diffが語彙を共有できない
- 案2は同じ情報の実体が2つになる。keycodeを正準形で保持するとADR 0001の
  「入力された表記のまま保持する」と衝突し、両方持てば「表記と正準形が食い違う状態」が
  型として表現可能になる。さらに正規化テーブルはD-003待ちのため、いま materialize すると
  **未確定のテーブルを構造へ焼き込む**ことになる
- 案3は状態が1つなので同期ずれが原理的に起きず（案1の利点）、解釈の語彙は型と関数へ集約される
  （案2の利点）。正規化テーブルが未確定でもインターフェースだけ固定してテーブル本体をD-003へ送れる
- `layout_options`で`groups`と`gatesKeys`を分けるのは、Cornix LPの「groupはあるがキーを1つも
  出し分けない」という実測状態を第3の状態として正しく表現するため。
  「labelsがある ⇒ 選択肢がある」でも「Cornixは0だから`layout_options`は無意味」でもない。
  **no-opなのは「Cornixだから」ではなく「gateするキーがゼロだから」**であり、
  別のdefinitionでは同じコードがgateを検出する。testで両方を押さえた
- 正規化テーブルを引数つきにするのは、ADR 0002の「同じ`USER01`が別のkeycodeを指す」と
  ADR 0003の「容量は実機が申告する」を同時に満たす形が他に無いため

## 影響

- 利用側は毎回`(document, definition)`の組を渡す。keymapとdefinitionの対応づけをworkspaceが
  持つ必要がある（D-004の入力）
- ビューは都度構築するため、大きなkeymapで頻繁に再構築すると無駄がある。
  memo化は利用側の責務とし、UIが来るまで最適化しない
- 実機Applyでは`capacities`を**実機の申告値へ置き換える**。`.vil`から観測した値を
  実機の容量として使ってはいけない（ADR 0003）
- `ResolvedKeycode`にu16との対応（ADR 0003）を足す場合、union に項が増えるだけで済む。
  wire値の比較はこの層を経由しない（ADR 0003の「比較はwire値で閉じる」を維持する）
- 以下は今回のseamが用意されただけで未実装。u16変換、VIA / Vial adapter、WebHID、
  ファイルI/O、workspaceと`keymap.yaml`、validation、semantic diff、rendering、
  macroと`key_override`の意味解釈、QMK keycode語彙の網羅、CLI、React
- `.vil`の`-1`と`KC_NO`の区別は構造的な意味として型で与える。編集操作は`-1`の位置へ書かない。
  混同するとdefinitionと矛盾する`.vil`を作る
- `fixtures/cornix-lp/edge-cases.vil`を追加した。`baseline.vil`には未知fieldが1つも無く、
  `layout_options`も`0`しか無いため、**baselineだけではescape hatchが1行も検証されない**
- 単一パッケージ構成で始める。`docbridge.config.json`は`packages/*/src/**/*.ts`も見ているが、
  実在しないパッケージ分割を先取りしない。分割の判断はUIがReact依存を持ち込む時点（D-004以降）
