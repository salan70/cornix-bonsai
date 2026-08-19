# Validation

keymap の検証と severity model の仕様です。判断はADR 0010にあります。

検証は実機にもReactにもfilesystemにも依存しない純関数です。実機の申告値は
`DeviceProfile`として引数で受け取ります。

## 依存方向

```text
core/validation → core/vil, core/definition, core/keycode, core/model
core/diff       → core/vil, core/definition, core/keycode, core/model, core/validation
```

`core/diff`が`core/validation`へ依存するのは、診断の型（`Diagnostic`）と語彙表を共有する
ためです。逆向きの依存はありません。想定外の大量変更の判定だけはdiffを入力に取るため
`core/diff`側に置いています。

## severity model

severityは**診断そのものの性質**だけで決めます。「今Applyしようとしているか」のような
文脈では変えません。文脈を持つのはApply gateだけです。

| severity      | 判定基準                                                      | Apply                      |
| ------------- | ------------------------------------------------------------- | -------------------------- |
| `error`       | 座標の意味が変わる、または`.vil`の構造が壊れている            | 常にblock。acknowledge不可 |
| `warning`     | 割り当てが1件単位で静かに失われる、実機が意図しない状態になる | 既定でblock。acknowledge可 |
| `information` | 情報は保持されている。判断はユーザーに委ねる                  | blockしない                |

この割り当ては`fixtures/cornix-lp/baseline.vil`（実機のexport）で較正しています。
**実機のexportがerrorもwarningも出さない**ことをtestで固定しており、これが崩れたときは
severityの割り当て側を疑います。

## 責務分割

段ごとに入力が増えます。入力の少ない段から走らせ、前提が崩れていたら後段を信じません。

| 段            | module             | 入力                         | 主なseverity  |
| ------------- | ------------------ | ---------------------------- | ------------- |
| structure     | `structure.ts`     | `VilDocument`                | error         |
| compatibility | `compatibility.ts` | + keyboard definition        | error/warning |
| reference     | `references.ts`    | + 容量（実機申告 or 観測）   | warning       |
| reachability  | `reachability.ts`  | `VilDocument`（layerグラフ） | warning/info  |
| device match  | `compatibility.ts` | + 実機の申告値               | error/warning |

`keymap.yaml`のschema検証はここではありません。この層が見るのは`.vil` rawの構造だけで、
入力の出どころに依存しません。

<!-- @code src/core/validation/types.ts#createDiagnostic -->

## createDiagnostic

診断を組み立てる唯一の入口です。`id`はここでしか作りません。

`id`は`code`と対象だけでなく**根拠の値の指紋**も含みます。含めないと、一度acknowledgeした
warningが、対象は同じで中身が変わった後もそのまま通ってしまいます。

<!-- @code src/core/validation/keycode-vocabulary.ts#classifyKeycode -->

## classifyKeycode

QMK / Vialのkeycode語彙表です。`docs/specs/semantic-model.md`が
「QMKの基本keycode語彙の網羅はD-003で扱う」と送っていた、その網羅です。

**`core/keycode/table.ts`へは置きません。** `createKeycodeTable`はdefinitionと容量を
引数に取る**解決**の責務で、解決できない表記は表記を保ったまま素通しします（ADR 0001・0006）。
「その表記をQMKの語彙として読めるか」は**判定**であり、出力は状態ではなく診断になります。
語彙表はdefinitionにも容量にも依存しない純粋な構文なので、factoryにする理由もありません。

この表は閉じた語彙ではありません。載っていない表記は`unknown`として
`reference/unknown-keycode`（warning）で報告し、黙って`KC_NO`へ落としません。

<!-- @code src/core/validation/keycode-vocabulary.ts#canonicalKeycode -->

## canonicalKeycode

alias（`KC_BSPC`と`KC_BSPACE`）を長い表記へ畳みます。**保存にもexportにも使いません**
（ADR 0001）。用途は語彙判定と、semantic diffの「表記だけの差」の分類だけです。

alias表は不完全でよい設計です。取りこぼしは「変更あり」側へ倒れるため、差分を静かに
消すことはありません。

<!-- @code src/core/validation/structure.ts#validateStructure -->

## validateStructure

`.vil` rawの構造を検証します。`parseVil`はtop-levelの型しか見ておらず、`layout` /
`tap_dance` / `combo`の中身はcastで通しています。そのcastが嘘になっていないかを見ます。

形が壊れているものは**すべてerror**です。この層の異常は「座標の意味が変わる」か
「値を読めない」のどちらかで、1件単位の欠落として扱えるものがありません。
例外はraw保持のescape hatchを踏んだことの通知で、これはinformationになります。

<!-- @code src/core/validation/compatibility.ts#validateCompatibility -->

## validateCompatibility

keymapとkeyboard definitionの組み合わせを検証します。

matrixの形が違えばerrorで、**そこで打ち切ります**。座標の対応そのものが未定義になるため、
以降の位置比較は意味を持ちません。definitionにない位置（`compatibility/orphan-position`）と
`.vil`側が`-1`になっている位置（`compatibility/unassignable-key`）は1件単位の欠落なので
warningで、layer横断の事実として位置ごとに1件へまとめます。

<!-- @code src/core/validation/compatibility.ts#validateDeviceMatch -->

## validateDeviceMatch

keymapを実機へ書ける状態かを検証します。実機readを終えてからでないと呼べません。

uid不一致と容量超過はerrorです。別のキーボードのkeymapを書くと座標の意味ごと違い、
容量超過はentry単位ではなくlayer単位で行き先が消えます。実機が申告しないqsidは
1件単位で書けないだけなのでwarningです。

`assertSameDevice`（ADR 0008）がApply直前に投げるのと同じ事実を、
**人間確認の前にdiffと並べて見せる**ためにここでも診断として出します。

<!-- @code src/core/validation/references.ts#validateReferences -->

## validateReferences

keycode文字列が**そのdefinitionとその容量で解決できるか**を判定します。

definition依存の解決（`USERnn`）は`createKeycodeTable`、definitionに依存しない語彙判定は
`classifyKeycode`に任せ、この関数は容量との突き合わせだけを行います。

`capacities`を省略した場合は`.vil`から観測した値を使います。実機Applyの経路では
**必ず実機の申告値を渡します**（ADR 0003）。範囲外参照をwarningにするのは、Vial側の
`restore_layout`が無言で`KC_NO`へ落とすためです。落ちるのは1件単位なので座標は動きません。

<!-- @code src/core/validation/reachability.ts#analyzeReachability -->

## analyzeReachability

layerをnode、layer操作keycodeをedgeとする有向グラフを組み、layer 0から辿ります。

definitionを引数に取りません。layerの到達性は座標ではなくkeycodeだけで決まるため、
渡すと「無くても答えが出る依存」を作ることになります。

**この解析は保守的に不完全です。** combo・tap dance・key override・alt repeat key経由の
layer遷移を見ていません。したがって結果をerrorにはできません。

<!-- @code src/core/validation/reachability.ts#toReachabilityDiagnostics -->

## Reachability diagnostics

到達性の結果を診断へ落とします。

- `reachability/unreachable-layer`: information。`baseline.vil`が5件出します。書けば書いた
  とおりに入り、失われる値もありません。設計上の指摘であってApplyを止める事実ではありません
- `reachability/trapped-layer`: warning。`TO` / `TG` / `DF`で入れて出口が無いlayerは、
  実機が操作不能になりえます。解析が不完全なのでerrorにはせず、人間が越えられる形にします
- `reachability/empty-layer`: information

<!-- @code src/core/validation/validate.ts#validateKeymap -->

## validateKeymap

4つの責務を合成した入口です。`device`を渡すと実機との組み合わせ検証まで行います。

`device`を渡した場合の容量は**実機の申告値**で、渡さない場合だけ`.vil`の観測値で代用します
（ADR 0003）。この分岐をここ1か所に閉じることで、call siteが誤って`.vil`由来の容量を
実機の容量として渡す経路を消しています。

この通常入口はdiagnosticsだけを返し、Apply用evidenceを生成しません。Applyへ進む場合は
`validateApplyKeymap`を使います。

<!-- @code src/core/validation/validate.ts#validateApplyKeymap -->

## validateApplyKeymap

`VilDocument`のvalidationと、write対象のdesired wire values生成を同じ入口で行います。
callerがdesiredやdesired fingerprintを渡す引数はありません。key / encoder / tap dance /
combo / settingの値は、実際にvalidationしたdocumentからVial protocol 6のu16・field列へ
fail-closedで変換します。変換できない表記は`KC_NO`へ落とさず拒否します。

validation evidenceは、keyboard UID、definition binding、実機申告 capacities、supported
qsid、diagnostics、内部導出したdesired、write targetを branded に束ねます。constructorは
exportせず、`validateApplyKeymap`だけがevidenceを生成します。したがって、benignなdocument A
をvalidationしながら別のdesired Bをevidenceへ載せる公開API経路はありません。

evidenceの`inputFingerprint`はcontext、diagnostics、desired、targetから決定的に作り、Apply
gateとplanから失われません。documentを変更した場合は新しいevidenceとgateが必要です。

<!-- @code src/core/validation/gate.ts#evaluateApplyGate -->

## evaluateApplyGate

**severityとApply blockingを接続する唯一の場所**です。evidenceを受け取った
`evaluateApplyGate`がvalidation対象identityを保持したgateを返し、
`createValidatedApplyInput`はそのgateだけをApply専用入力へ変換します。

acknowledgeは診断の`id`単位です。idには根拠の値の指紋が入っているため、
**同じ位置でも中身が変わればacknowledgeは自動的に外れます**。

warningを非blockingにしないのは、warningの中身が「Vialが無言で`KC_NO`へ落とす」
「実機が操作不能になる」といった**静かに壊れる**事実だからです。逆にerrorにすると、
正当な編集でApplyが永久に不可能になります。

`assertApplyAllowed`は、開いたgateを branded `ApplyAllowedValidation` として返します。
`src/core/apply/plan.ts` の `createValidatedApplyInput` は evidence付きgateとbackupだけを
受け取ります。desiredとwrite targetはevidenceからしか取得できないため、古いvalidation
結果と新しいApply対象を組み合わせる引数がありません。

<!-- @code src/core/validation/gate.ts#assertApplyAllowed -->

## assertApplyAllowed

gateが開いていることを確かめ、開いていなければ`ApplyBlockedError`を投げ、evidence付き
gateが開いていれば branded `ApplyAllowedValidation`を返します。

**Applyの入口はこれ1か所です。** `createValidatedApplyInput`が必ず通します。上位のフラグで
分岐させる方式を採らないのはADR 0008と同じ理由で、分岐は消し忘れると効かなくなります。

## Fixture

`fixtures/cornix-lp/invalid-cases.vil`は、warningを踏むための合成fixtureです。
範囲外の`MO(9)`、語彙表にない`KC_BOGUS`、definitionにない`USER99`、中身が空の`TD(0)`、
出口の無いlayer 1、到達できないlayer 2、実機が申告しないqsid 999を含みます。
`baseline.vil`はerrorもwarningも出さないため、blocking側の経路はこのfixtureで検証します。
