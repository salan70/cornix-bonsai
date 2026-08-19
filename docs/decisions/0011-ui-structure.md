# UIはworkspaceを入口とする4 tabで構成し、Applyだけを線形のmodalへ分離する

状態: 採用

2026-08-19に、既存ADRがUIへ送った制約を洗い出し、`fixtures/cornix-lp/`の実データと
`src/core/`の実出力でwireframeを描いて決めた。実装は行っていない。実機操作も行っていない。

wireframe: [Cornix Bonsai UI canvas](https://claude.ai/code/artifact/9ba207f6-5ce2-4b47-9195-773cb9e2a9ed)
（Git管理外。判断はこのADR本文が単独で読めるようにしてある）

## 背景

Core・Device I/O・desired state・validation・Safe Applyの判断はADR 0001〜0010で確定し、
`src/core/`に純粋なTypeScriptとして実装済みである。一方でUIは情報構成
（Keymap / Overview / Behaviors / References の4面）までしか決まっていない。

このままMVPのfrontend実装へ入ると、画面構成・編集interaction・Apply確認UIを同時に
暗黙決定することになる。既存ADRは影響節でUIへ複数の制約を送っており、それらは
明文化しないと実装時に落ちる。

確定済みでUIを縛る制約は以下。

- transport（USB / BLE）はJSから判別できず、UIで区別しない（ADR 0004）
- 全readは168往復で、USB約0.34s・BLE約7.0s。進捗は**往復回数**で出し、
  残り時間を推定表示しない（ADR 0004）
- device chooserの入口は`getDevices()`が空でも常に出す。UI側に`HIDDevice`を持たせない（ADR 0004）
- ackは成功の証明にならず、再readの一致も**永続化の証明にはならない**。
  文言で「保存した」「永続化した」と言わない（ADR 0005 / 0008）
- Applyはbackupを前提条件とする状態機械で、中断したら全readからやり直す。
  再開に必要な情報が型として存在しない（ADR 0008）
- backupはApplyごとに`cornix/backups/`へ保存し、UIから復元できる導線を持つ（ADR 0007）
- severityは診断の性質だけで決まる。UIの都合でseverityを動かさない（ADR 0010）
- warning acknowledgeは診断ID単位で、根拠の値を指紋に含むため自動失効する（ADR 0010）
- `settings`の表示辞書はUIが与える。辞書が無くてもqsidと値を必ず出す（ADR 0010）
- 物理配列はdefinition由来のrendering専用派生データで、`row`番号ではなく座標で描く（ADR 0002）
- encoderの本数は実機ごとに違う前提で組む（ADR 0003）

## 選択肢

画面構成について。

1. 実機接続を入口にし、read → 編集 → Applyを1本のwizardとして並べる
2. workspace（`keymap.yaml`）を入口にし、4 tabを常設し、Applyだけをmodalの線形フローへ分離する
3. 4 tabに加えてApplyもtabとして並べ、状態に応じて中身を切り替える

Keymap editorのキー編集について。

1. キーをクリックしたらpopoverを開く
2. キーをクリックしたら右側の常設side panelへ内容を出す

## 決定

画面構成は案2、キー編集は案2を採る。

### 入口はworkspaceであって接続ではない

desired stateは`keymap.yaml`であり、実機readが要るのは初回の取り込みとApplyのときだけである。
編集はデバイスが繋がっていなくても成立する。したがって接続は独立した画面にせず、
常設headerの1要素（接続状態のchipと再読み込みボタン）に留める。

backupからの復元もheaderに置く。Applyの中でしか辿れない場所へ置かない。

### 4 tab + 常設header + 常設status bar。Applyだけがmodal

- tabは`Keymap` / `Overview` / `Behaviors` / `References`の4つ。tabは表示の切り替えであり、
  状態を持たない
- **Applyはtabにしない。**Applyは途中で他の画面へ移れない状態機械であり
  （ADR 0008の`abortApply`が残りのoperationを捨てる）、tabとして並べると
  「他のtabへ移れる」というUIの含意が型の制約と食い違う
- status barは常設し、error / warning / informationの件数、実機との差分件数、
  Applyの入口を出す

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 🌱 Cornix Bonsai  workspace ~/keyboards/cornix    ● 接続済み  再読込  復元 │ header
├──────────────────────────────────────────────────────────────────────┤
│ [Keymap] Overview  Behaviors  References                             │ tab
├────────────────────────────────────────────┬─────────────────────────┤
│ Layer  (Base) Num Nav Sym System  未使用5〜9  │ 選択中のキー             │
│                                            │  layer 0 / row 3 / col 3│
│   ┌──┐┌──┐┌──┐          ┌──┐┌──┐┌──┐        │ 動作   [Layer Tap    ▾] │
│   │Q ││W ││E │   …      │U ││I ││O │        │ Tap    [英数         ▾] │
│   └──┘└──┘└──┘          └──┘└──┘└──┘        │ Hold   [Layer 1 Num  ▾] │
│        ┌──┐┌──┐    ┌──┐┌──┐                │ ─────────────────────── │
│        │英数││Sym│    │⏎ ││Sp│              │ keycode LT1(KC_LANG2)   │
│        └──┘└──┘    └──┘└──┘                │ 参照    Num へ →        │
│   ◯ Encoder 0（左）        ◯ Encoder 1（右） │                         │
├────────────────────────────────────────────┴─────────────────────────┤
│ ⛔0  ⚠2  ⓘ5   |  実機との差分 5 件        keymap.yaml  [差分] [Apply…] │ status
└──────────────────────────────────────────────────────────────────────┘
```

### Keymap editorはHTML/CSSの絶対配置で描き、SVGはexport専用にする

`toPhysicalLayout`が返す座標をそのまま使い、`transform: rotate()`で親指キーの回転を再現する。
描画と入力を持つeditorはHTML/CSSで組み、SVG / PDF exportは同じ座標を消費する
**別のrenderer**とする。共有するのはmarkupではなく幾何情報だけにする。

encoderは盤面と分けた専用の帯に描く。definitionのKLE上でencoderが持つ座標は
凡例の位置（`x` 15.25〜18.75）であって物理位置ではないため、盤面へそのまま置くと
存在しない位置に描くことになる。

### キーの編集は右側の常設side panel

1つのキーがtap / hold / layer / modifier / raw keycodeという複数の面を持つ。
popoverは盤面を隠し、連続して編集するたびに位置を見失う。side panelなら
編集中も盤面と現在のlayerが見えている。

- keycapは2段まで。上段に主ラベル（tap側）、下段に役割（`⌘`、layer名、`Tap Dance`など）
- **layerを指すkeycodeはlayer名を出す。**`MO(2)`は「Nav」と表示し、`layer 2`とは出さない
  （名前の出どころはADR 0012）
- ModifierはmacOS表記（`⌘` `⌥` `⌃` `⇧`）を優先する
- raw keycodeはkeycapに出さず、side panelの「詳細」にだけ置く
- キーボード操作は、方向キーで幾何的に隣のキーへ選択移動、Enterでpanelへfocus、Escで盤面へ戻る

### 診断はstatus barに件数、panelに一覧

status barのseverity件数をクリックすると診断panelが開く。各行はcode・message・対象を出し、
選ぶと該当のlayerとキーへ選択が飛ぶ。対象を持つ診断は盤面側も縁取りで示す。

**severityの色だけで区別させない。**icon・severity名・codeを必ず添える。

同じcodeが対象違いで並ぶとき（`reachability/unreachable-layer`が5件など）は
1件だけ出して残りを折りたたむ。

### warning acknowledgeはApplyの確認stepでだけ行う

編集画面にacknowledgeのUIを置かない。acknowledgeは根拠の値を指紋に含み、差分が変われば
自動で外れる「このまま実機へ書いてよいかの判断」であり（ADR 0010）、Applyの文脈から
切り離すと意味が変わる。

### Applyのmodalは5 stepの線形フロー

```text
backup（全read） → 差分確認 → 人間確認（warning acknowledge込み） → 書き込みとverify → 結果
```

- 人間確認までcancelできる。書き込み開始後は「中断」だけを出す。
  中断後は途中までの状態を持ち越さず全readからやり直すことを、その場で明示する
- 進捗は「n / m 件を書き込んで確認した」と「往復 n / m 回」で出す。**残り時間を出さない**
- 完了時の文言は「実機に反映した」。電源を切っても残ることは確認していないと明示し、
  確かめたい場合の手順（電源を入れ直して読み直す）はユーザー操作としてだけ提供する
- 差分はlayer / behavior種別でグループ化する。`notationOnly`は既定で折りたたむが、
  **書き込み対象には含まれる**ことを畳んだ行に書く
- `detectBulkChange`が立ったらbannerを出す

### visual direction

- 基調はneutral gray、accentはbonsaiの緑1色。severity色とdiff色は装飾ではなく意味を
  持つため別枠とし、accentの数には数えない
- 影とグラデーションを使わず、borderと淡い塗りで面を分ける。radiusは小さく取る
- light / darkはCSS custom propertiesと`prefers-color-scheme`で両対応する。
  MVPではsystem追従のみとし、トグルを持たない
- UIはsystem sans。raw keycodeとファイルパスだけmonospace
- キー配置・behavior・差分の可読性を装飾より優先する

## 理由

- 案1（接続を入口にするwizard）は、デバイスが無いと何もできないUIになる。
  desired stateがGit管理の`keymap.yaml`である以上（ADR 0009）、編集は接続と独立に成立し、
  AIエージェントやCLIからの編集経路とも整合しない
- 案3（Applyもtab）は、ADR 0008が型で消した「中断したApplyの再開」をUI上に残してしまう。
  UIの構造が型の制約と食い違うと、実装は必ずどちらかを裏切る
- popoverを退けたのは、Cornix LPが50キー × 10 layerで、編集が1キーで終わらないためである。
  盤面が見えたまま連続して編集できることが、この編集対象では見た目の軽さより重い
- 進捗を往復回数で出すのは、USBとBLEで同じ168往復が0.34sと7.0sに分かれるためである
  （ADR 0004）。時間の推定値はどちらかで必ず外れる
- 「保存した」と書かないのは、R-005で**ackも再readもflashに載ったことを意味しない**ことが
  実測で分かっているためである。UIの文言が保証していない状態を保証すると、
  ユーザーは電源断で設定が戻る事故の原因を追えなくなる

## 影響

- SVG / PDF exportはHTML editorとは別のrendererになる。座標の導出（`toPhysicalLayout`）だけを
  共有し、2つのrendererが同じ盤面を描くことになる。両者のずれはtestで抑える必要がある
- layer名を表示に使うと決めたため、名前の置き場が要る。ADR 0009は`keymap.yaml`に
  layer名を持たないと決めているので、別の置き場をADR 0012で決める
- `settings`はUIがCornix LP公式firmware V1.12のqsid辞書を用意して表示する。
  辞書にない値は`qsid 999: 180`のようにraw表記を残す
- 診断panelとApply確認stepで同じ診断を別の見せ方で出すため、diagnostic 1件を描く
  componentは共有できない。共有するのは文言の生成だけになる
- Applyのmodalは書き込み中に閉じられないため、他のtabの内容を見ながら差分を確認する導線が無い。
  差分確認stepで必要な情報（対象のlayer名・キー位置・挙動の説明）はmodal内で完結させる
- encoderを専用の帯へ分けたため、encoderと盤面上の押し込みキー（Cornix LPでは`2,6`と`5,6`）が
  UI上で離れる。対応関係を示す表現が別途要る
