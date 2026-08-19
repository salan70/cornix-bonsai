# 2026-08-19 D-003 validationとsemantic diffの責務を決める

対象Issue: #8 `[D-003] validationとsemantic diffの責務を決める`

## 調査方法

- ADR 0001・0002・0003・0005・0006・0008 を読み、確定済みの制約とD-003へ送られた
  未確定事項を分離した
- `src/core/`の既存実装（vil / definition / keycode / model / apply）を読み、
  validationとdiffが再定義してはいけない境界を洗い出した
- validationとsemantic diffを実機I/Oから切り離した純関数として実装し、
  `fixtures/cornix-lp/`の実exportでseverityの割り当てを較正した
- **実機操作は行っていない。** AGENTS.mdの禁止事項どおり、write / flash / resetは実行していない

## Fact

### 先行ADRで確定済み（D-003で再決定しない）

- keycodeは正規化せず入力表記のまま保持する。未対応の表記はVial自身が無言で`KC_NO`へ落とす
  （ADR 0001）
- 同じ`USER01`が別のkeycodeを指すdefinitionが実在する（ADR 0002）
- 容量（layer数・macro数・tap dance数・combo数・対応qsid）は実機が申告する（ADR 0003）
- 解釈できない表記は`kind: "basic"`で素通しし、容量の範囲外は`outOfRange`を返す（ADR 0006）
- Applyの前提条件はフラグやassertionではなく型と引数で強制する（ADR 0008）

### D-003へ送られていた未確定事項

- validationのうちどれをApply blockingにするか（ADR 0008 の影響、D-005の作業ログ）。
  Applyの状態機械はvalidationの結果を引数に取っていない
- QMKの基本keycode語彙の網羅（docs/specs/semantic-model.md）

### 実装中に観測した事実

- `baseline.vil`のkeycodeは119種類。語彙表を書いたあと、**unknownは0件**になった
- 到達不能layerをwarningにした最初の実装では、`baseline.vil`が5件のwarningを出した
  （layer 5〜9に割り当てがあるが、layer 0から辿り着くkeycodeが無い）。
  実機のexportが既定でApplyを止める状態になっていた
- `KC_ESC`のようなalias表記は、長い表記（`KC_ESCAPE`）だけの語彙表ではunknownになる。
  alias表は語彙判定にも必要だった
- `edge-cases.vil`はmatrix 2x2で、公式definition（8x7）と組ませるとmatrix不一致のerrorになる。
  合成fixtureとして正しい挙動

## Spike結果

Spikeは作らず、`src/core/validation/`・`src/core/diff/`の実装とtestで確認した。
外部挙動の未確認事項がなく（すべて先行ADRが実測済み）、測る対象が無いため。

test 27件を追加した（validation 14 / diff 13）。責務と境界を固定している中核は以下。

- `baseline.vil`が`reference/unknown-keycode`を1件も出さない
  → QMK語彙の網羅の合格条件
- `baseline.vil`がerrorもwarningも出さず、Apply gateが開く
  → severityの割り当てが実データで較正されていることの固定
- 同じcode・同じ位置でも根拠の値が変わるとacknowledgeが外れる
  → 一度越えたwarningが以後ずっと通る経路を塞ぐ
- 実機容量を渡すと`.vil`観測では出ない`reference/out-of-range`が出る
  → 容量の出どころが結果を変えることの固定（ADR 0003）
- aliasの書き換えは`notationOnly`になり`changedCount`に入らないが、entryとしては残る
  → alias表の誤りが差分の握りつぶしにならない
- `USERnn`はrawで比較し、表示だけdefinitionの`title`を使う
  → definitionを差し替えたときの誤判定を防ぐ
- 大量変更は件数と割合の両方を満たすときだけ出る（片方だけの閾値では出ない）

`fixtures/cornix-lp/invalid-cases.vil`を追加した。`baseline.vil`はerrorもwarningも
出さないため、blocking側の経路がbaselineだけでは1件も検証されない。

## Decision

ADR `docs/decisions/0010-validation-and-diff.md`（状態: 採用）に記録した。
仕様は`docs/specs/validation.md`と`docs/specs/semantic-diff.md`。

severityは診断の性質だけで決め、Apply blockingの境界はgate 1か所で与える。
errorは常にblock、warningは診断id単位のacknowledgeで越えられる、informationは止めない。
diffの判定はすべてraw表現で行い、semantic表現は説明文にしか使わない。

## Open Question

- **`assertApplyAllowed`を通す規約が、まだ規約でしかない。** ADR 0008 の状態機械は
  validationの結果を引数に取っておらず、`createApplyPlan`の前にgateを通すことを
  型で強制していない。`src/core/apply/`側へgateを引数として足す変更が要る（D-003の範囲外）
- 大量変更の閾値（20件・30%）に実測の裏付けが無い。実運用のdiffを何件か見るまで根拠が出ない。
  acknowledgeで越えられるため、外した場合の代償は確認1回で収まる
- keycodeの語彙表とalias表は閉じていない。載っていない表記はwarningになるだけで
  静かな取り違えにはならないが、実運用で足していく前提になる
- **`settings`のqsid → 設定名の対応表を持っていない。** 定義元はVial側（`qmk_settings.json`）で、
  実機が対応qsidを申告する。表示辞書として外から受け取る形にしたが、辞書そのものの
  取得経路は未定（D-004以降）
- 到達性解析はcombo・tap dance・key override・alt repeat key経由のlayer遷移を見ていない。
  閉じ込め判定に偽陽性がありうるため、warningにしてacknowledgeで越えられる形にしている
- acknowledgeした診断idの保存先が未定（D-004）
- macroと`key_override` / `alt_repeat_key`はrawのJSON比較でしか扱っていない。
  意味解釈は未実装（ADR 0006 の積み残し）
- `fixtures/README.md`に`invalid-cases.vil`の説明を足していない。D-002が同時に
  fixtures配下へ触れる可能性があり、衝突を避けるため見送った
