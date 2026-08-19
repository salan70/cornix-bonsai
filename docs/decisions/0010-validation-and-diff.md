# severityは診断の性質だけで決め、Apply blockingはgate 1か所で接続し、diffはrawで判定する

状態: 採用

2026-08-19に、validationとsemantic diffを実機I/Oから切り離した純関数（`src/core/validation/`、
`src/core/diff/`）として実装し、`fixtures/cornix-lp/`の実exportで較正して決めた。
実機操作は行っていない。

## 背景

ADR 0008 が「validationのうちどれをApply blockingにするかはD-003の範囲」を明示的に送っており、
Applyの状態機械はvalidationの結果を引数に取っていない。またdocs/specs/semantic-model.mdが
「QMKの基本keycode語彙の網羅はD-003で扱う」を送っていた。

確定済みの制約は以下。

- keycodeは正規化せず入力表記のまま保持する（ADR 0001）。比較・validationは正規化を挟む
- 未対応のkeycode文字列はVial自身が無言で`KC_NO`へ落とす（ADR 0001）
- `customKeycodes`は定義順がそのまま`USER00`, …になり、同じ`USER01`が別のkeycodeを指す
  definitionが実在する（ADR 0002）
- 容量（layer数・macro数・tap dance数・combo数・対応qsid）は実機が申告する（ADR 0003）
- Semantic Modelは`createKeycodeTable(definition, capacities)`で解決し、解釈できない表記は
  表記を保ったまま素通しする（ADR 0006）
- Applyの前提条件はフラグやassertionではなく型と引数で強制する（ADR 0008）

## 選択肢

1. severityを文脈で決める。同じ事実でも「Applyしようとしている」ときはerror、
   閲覧中はwarningにする
2. severityを診断の性質だけで決め、Apply blockingの境界は別の層（gate）で与える。
   errorは常にblock、warningは診断id単位のacknowledgeで越えられる、informationは止めない
3. blockingフラグを診断ごとに持たせ、severityとは独立に宣言する

## 決定

案2を採る。

- **severityの判定規則を3つに固定する。** `error`は座標の意味が変わるか`.vil`の構造が
  壊れているもの。`warning`は割り当てが1件単位で静かに失われるか、実機が意図しない状態に
  なるもの。`information`は情報が保持されていて判断をユーザーへ委ねられるもの
- **Apply blockingの境界はgate 1か所で与える。** validation evidenceを受け取る
  `evaluateApplyGate(evidence, acknowledgedIds)`がerrorを常にblockし、未acknowledgeのwarningを
  blockし、informationを通す。`assertApplyAllowed`が返す evidence付き branded gate と
  `ValidatedApplyInput` を`createApplyPlan`が必須にする
- **acknowledgeは診断id単位**とし、idに`code`・対象・**根拠の値の指紋**を含める。
  中身が変われば同じ位置でもacknowledgeが自動的に外れる
- **Apply planはUID・definition binding・実機容量・supported qsid・backup・desired・target
  の対応を保持し、plan fingerprintをconfirmationに要求する。** validation evidenceの
  desired fingerprintをApply入力で再照合し、validation対象と確認済みdiffをwrite開始時まで
  結びつける
- **責務は入力の増え方で分ける。** structure（`VilDocument`のみ）→ compatibility
  （+ definition）→ reference（+ 容量）→ reachability（layerグラフ）→ device match
  （+ 実機の申告値）。`keymap.yaml`のschema検証はこの層に入れない
- **QMKの基本keycode語彙表は`core/validation/`へ置く。** `createKeycodeTable`へは足さない
- **semantic diffの判定はすべてraw表現で行う。** semantic表現は説明文だけに使い、
  差分の有無を決めない。唯一の例外がaliasの畳み込みで、これも差分を消さず
  `notationOnly`として分類するだけにする
- **`settings`は常にqsid → 数値で比較する。** qsidから設定名への対応は任意の表示辞書として
  受け取り、辞書に無いqsidは`qsid 22`のままrawで出す
- **`USERnn`は表記のまま比較し、表示だけdefinitionの`title`を使う**
- **想定外の大量変更は件数と割合のANDで判定する。** 既定は20件かつ30%。加えてlayer単位の
  全面置換を別codeで警告する
- **keymapとdefinitionの不一致は、matrixの形の違いをerror、位置単位の食い違いをwarningに
  する。** matrixが違えばその時点で打ち切り、位置比較を行わない。実機との不一致は
  uid不一致と容量超過がerror、未対応qsidがwarning

## 理由

- 案1は同じ事実が画面によって別の深刻度で出る。severityの定義がUIの都合に侵食され、
  「なぜこれがerrorなのか」を後から説明できなくなる。文脈を持つ場所を1つに限れば、
  severityは診断の性質の記述として安定する
- 案3はblockingフラグとseverityが独立に増える。組み合わせの数だけ「warningだがblockしない」
  「informationだがblockする」という説明の要る状態が生まれ、規則が覚えられなくなる
- **warningを非blockingにできない。** warningの中身は「Vialが無言で`KC_NO`へ落とす」
  「実機が操作不能になる」で、いずれも**静かに壊れる**。ADR 0005・0008 が型で塞いできた
  経路と同じ性質なので、既定では止める
- **warningをerrorにもできない。** 到達性解析はcombo・tap dance・key override経由の遷移を
  見ておらず偽陽性がありうる。definitionより新しいkeymapもwarningを出す。errorにすると
  正当な編集でApplyが永久に不可能になる。だから「止めるが、人間が個別に越えられる」にする。
  これがAGENTS.mdのApplyフローにある「人間が確認」の実体になる
- acknowledgeに指紋を入れないと、一度越えたwarningが以後ずっと通る。範囲外参照の
  indexだけが変わった場合など、同じ位置で別の事実になっても止まらなくなる
- **severityは実fixtureで較正した。** 最初は到達不能layerをwarningにしていたが、
  `baseline.vil`（実機のexport）が5件出した。書けば書いたとおりに入り、失われる値も無い
  ものでApplyを止めるのは規則の側が間違っている。informationへ下げ、
  「実機のexportはerrorもwarningも出さない」をtestで固定した
- 語彙表を`createKeycodeTable`へ足さないのは、あちらがdefinitionと容量を引数に取る
  **解決**の責務で、解決できない表記は素通しすると決まっているため（ADR 0006）。
  「QMKの語彙として読めるか」は**判定**で、出力は状態ではなく診断になる。素通しの方針を
  変えずに語彙を足せる場所はvalidation側しかない。語彙表はdefinitionにも容量にも
  依存しないので、factoryにする理由も無い
- diffをrawで判定するのは、semantic表現がdefinitionを引数に取る派生値だから（ADR 0006）。
  表示名で比較すると、definitionを差し替えただけで差分が消えたり増えたりする。
  `USER01`が別のkeycodeを指すdefinitionが実在する以上、これは実害になる
- aliasを`notationOnly`として残すのは、ADR 0001 が正規化を禁じている以上raw比較では
  `KC_BSPC`と`KC_BSPACE`が差分になるため。かといって差分から消すと、alias表の誤りが
  そのまま「差分の握りつぶし」になる。分類だけして残せば、alias表が不完全でも
  取りこぼしは「変更あり」側へ倒れる
- 大量変更をANDにするのは、件数だけでは10 layer × 50キーのkeymapが1 layerの差し替えで
  毎回引っかかり、割合だけではcomboを2件しか持たないkeymapが1件の変更で50%になるため。
  片方だけでは「規模が大きい」と「全体に対して大きい」を区別できない
- matrixの形が違う時点で打ち切るのは、座標の対応そのものが未定義になるため。
  そのまま位置比較を続けると、意味の無いorphan診断を大量に出して本当の原因を埋める

## 影響

- **`createValidatedApplyInput`を経由しないApply plan生成はできない。** validation evidence、
  full-read coverage、desired / target対応を`src/core/apply/plan.ts`の入力型へ集約し、
  evidenceのcontextとdesired fingerprintを独立引数で差し替えられないようにする
- acknowledgeした診断のidをworkspaceが持ち回る必要がある。置き場所はD-004
- 語彙表は閉じていない。載っていない表記はwarningになるため、**実運用で語彙を足していく
  前提**になる。足し忘れは「Applyが1回止まる」で済み、静かな取り違えにはならない
- alias表も閉じていない。取りこぼしは差分に残るだけなので、追加は随時でよい
- `settings`の表示辞書はCornix Bonsaiが持たない。UIが辞書を渡さない限り、settingsは
  qsidのまま表示される（D-004以降の入力）
- 大量変更の閾値（20件・30%）に実測の裏付けは無い。acknowledgeで越えられるため、
  外した場合の代償は「確認が1回増える」で収まる
- semantic diffはmacroと`key_override` / `alt_repeat_key`をrawのJSON比較でしか扱わない。
  macroはwrite経路を持たず（ADR 0005）、意味解釈も未実装のため
- `fixtures/cornix-lp/invalid-cases.vil`を追加した。`baseline.vil`はerrorもwarningも
  出さないため、**blocking側の経路はbaselineだけでは1つも検証されない**
