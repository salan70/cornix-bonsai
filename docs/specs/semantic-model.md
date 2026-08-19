# Semantic Model

UI、CLI、analysis、rendering、Git管理設定、Vial adapterが共有する内部表現の仕様です。
境界の判断はADR 0006にあります。

## 層と依存方向

状態は`VilDocument`（raw層）**ただ1つ**です。意味表現はそこからkeyboard definitionと
組にして導出する読み取り専用の派生値で、保存も比較の正ともしません。
編集は意味単位の位置指定を受け取り、rawを返す純関数で行います。

| 層                        | 実体               | round-trip対象 |
| ------------------------- | ------------------ | -------------- |
| raw                       | `VilDocument`      | ○              |
| semantic（派生ビュー）    | `KeymapView`       | ×（都度導出）  |
| device（u16のwire値）     | 未実装（ADR 0003） | ×              |
| 物理配列（rendering専用） | `PhysicalLayout`   | ×              |

依存方向は一方向です。

```text
core/vil        → （何にも依存しない）
core/definition → （何にも依存しない）
core/keycode    → core/definition
core/model      → core/vil, core/definition, core/keycode
adapter（.vilのファイルI/O、WebHID、React）→ core
```

`src/core/`配下はReact、filesystem、WebHIDをimportしません（AGENTS.md設計ルール）。
`parseVil`が文字列を受け取り`node:fs`を使わないのはこのためです。

<!-- @code src/core/definition/parse.ts#toPhysicalLayout -->

## toPhysicalLayout

keyboard definitionのKLEを展開して物理配列を得ます。展開規則はvial-guiの
`kle_serial.py`が正です（ADR 0002）。分類は`keyboard_comm.py`の`reload_layout`に
合わせ、`labels[4] === "e"`をencoder、`labels[0]`に`,`を含むものをkeyとします。

**引数はdefinitionだけです。`.vil`を参照しません。** 物理配列はrendering用の派生データで
あり`.vil`のround-trip対象ではない、という責務がそのまま型に出ています。
`.vil`との突き合わせはテスト側に置きます。

KLEの`x` / `y`は回転前の左上座標です。回転キーの実際の位置は`keyCenter`で求めます。
左右の別のような機種固有の閾値はここに入れません。ADR 0002が禁じたhard-codeになります。

<!-- @code src/core/keycode/table.ts#createKeycodeTable -->

## createKeycodeTable

keycode文字列の解釈テーブルです。ADR 0001・0002・0003がそれぞれ
「正規化テーブルの単一の定義元が要る」をD-001の入力として先送りしていた、その定義元です。

**モジュール定数にできません。** 理由は2つあります。

- custom keycodeの意味はdefinitionの定義順で決まる（ADR 0002）。
  同じ`USER01`が別のkeycodeを指すdefinitionが実在する
- `MO(n)` / `LT n(kc)` / `TD(n)` / `M(n)`の語彙はlayer数・tap dance数・macro数から
  生成される。これらの容量は実機が申告するもので、firmwareごとに違う（ADR 0003）

したがってdefinitionと`Capacities`を引数に取るfactoryとして構成します。

解釈できない表記は`kind: "basic"`として**表記を保ったまま素通し**します。
QMKの基本keycode語彙を網羅した表は持ちません。網羅はD-003で扱います。
容量の範囲外は`kind: "outOfRange"`を返し、黙って`KC_NO`へ落としません。

<!-- @code src/core/model/layout-options.ts#resolveLayoutOptions -->

## resolveLayoutOptions

`layout_options`を解釈します。**Cornix LP公式firmwareのno-op挙動を一般化しない**ことが
この関数の主眼です。

公式firmware V1.10以降の`layouts.labels`は`[["Firmware Version", "V1.12"]]`で、
firmware versionの表示に流用されています（ADR 0002）。したがって
**「labelsがある ⇒ layout選択肢がある」は成り立ちません。**

そこで2つの情報を独立に持ちます。

- `groups`: `layouts.labels`由来。表示用の選択肢の宣言
- `gatesKeys`: 物理配列由来。選択肢で出し分けられるキーが1つでもあるか

Cornix LPは`groups`があり`gatesKeys`が`false`という第3の状態になります。
「Cornixだからno-op」ではなく「gateするキーがゼロだからno-op」であり、
別のdefinitionでは同じコードがgateを検出します。

`raw`が負の値のときは`kind: "unread"`です。Vialが実機から読まなかったことを意味し、
「読んだ結果が0」とは別状態として区別します。

解釈結果は**表示のためだけ**に使います。exportは常にrawをそのまま書き戻すため、
round-tripは解釈の正しさに依存しません。

<!-- @code src/core/model/keymap-view.ts#buildKeymapView -->

## buildKeymapView

rawとdefinitionからSemantic Viewを導出します。

走査の起点は**definition由来の物理配列**であって`.vil`の全マスではありません。
`.vil`に値があってdefinitionの物理配列に無い位置は捨てず、`orphanPositions`へ集めます。
definitionのバージョン違いを黙って落とさないためです。

encoderの`direction`は`0` / `1`ではなく`"ccw"` / `"cw"`として表現します。
direction 0が反時計回りであることはADR 0003で確定しています。

`capacities`は`.vil`から観測した値です。**実機Applyでは実機の申告値で置き換えます**
（ADR 0003）。`.vil`由来の値を実機の容量として使ってはいけません。

<!-- @code src/core/model/edit.ts#setKeyAssignment -->

## setKeyAssignment

`(layer, row, col)`のkeycodeを差し替え、新しい`VilDocument`を返す純関数です。
Viewを経由しないため、状態の二重化が起きません。

「rawが唯一の状態」という決定は書き戻しが成立して初めて成り立つため、
この関数が境界の成立条件そのものです。

物理キーが存在しない位置（`-1`）と範囲外へは書かず、`KeymapEditError`を投げます。
keycodeは正規化せず、渡された表記のまま置きます（ADR 0001）。
