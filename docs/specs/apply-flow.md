# Applyフロー

desired configurationをCornix LPへ書き込む手順の仕様です。
判断はADR 0005とADR 0008にあります。

実機との往復はadapterが行い、この層は結果だけを受け取ります。
WebHID、React、filesystemには依存しません。

## 手順

```text
全read backup → validation → diff → 人間確認 → 1件ずつwrite + 再read
  → 失敗したら中断し、全readからやり直す
```

<!-- @code src/core/apply/commands.ts#WRITE_COMMANDS -->

## WRITE_COMMANDS

実機へ送るwrite commandの許可リストです。単一entryのcommand5種類だけを載せます。

**reset系のcommandをここに載せないことが、AI / CLIからのwrite境界の実体です。**
上位に権限フラグを置いて分岐させる方式は採りません。分岐は消し忘れると効かなくなりますが、
commandが存在しなければ呼びようがありません。

`0x13`（keymap bulk）、`0x0F`（macro buffer）、`0x0A` EepromReset、
`0x0B` BootloaderJump、`0x06`、`0x15`は載せません。理由は`NOT_IMPLEMENTED_COMMANDS`の
コメントにあります。

<!-- @code src/core/apply/plan.ts#createValidatedApplyInput -->

## createValidatedApplyInput

validation evidenceとfull-read backupをひとつの `ValidatedApplyInput`に束ねます。desiredと
write targetは、`validateApplyKeymap`が実際に検証した`VilDocument`から内部導出してevidence
へ保持した値だけを使います。callerがこの関数へ別のdesiredやtargetを渡す引数はありません。

evidenceには definition binding / keyboard UID / 実機申告容量 / supported qsid /
diagnostics / validated desired / write target が含まれます。

gateが閉じている場合は `ApplyBlockedError`、backupが空の場合は precondition error です。
desiredに存在するtargetがbackupに無い場合も precondition error とし、partial stateを
silent skipしてApply計画へ進めません。desiredのすべてのtargetが明示的なwrite targetに
対応していることもここで確認します。

この関数が返す branded type が、validation済み入力の唯一の公開入口です。通常の gate、
独立した context、caller supplied desiredを別引数として渡すAPIはありません。

<!-- @code src/core/apply/plan.ts#createApplyPlan -->

## createApplyPlan

`ValidatedApplyInput`から差分を計算します。planにはvalidation対象の UID、definition binding、
capacities、supported qsidと、全入力から導いた決定的な `fingerprint` を保持します。

validation gateを含まない通常の入力からは型上 planを生成できません。空のbackupは
`createValidatedApplyInput`で `ApplyPreconditionError` になります。firmwareにrollback機能は
無く、復元元はhost側のbackupしか存在しないため、backupはwriteの前提条件です。

desiredにあってbackupに無いtargetは差分に含めません。実機がそのentryを持たない可能性が
あるため、計画生成前に precondition error として止めます。容量は実機が申告するものです
（ADR 0003）。

<!-- @code src/core/apply/plan.ts#confirmApply -->

## confirmApply

人間確認で表示した `fingerprint` を必須引数として受け取り、planと一致したときだけwriteを
開始します。古い確認値や別のplanのfingerprintでは `ApplyPreconditionError` になり、
`writing` へ遷移しません。

rollbackも専用のvalidation bypassを持ちません。rollback対象のdesired（元のbackup）に対する
別のvalidation evidenceを受け取り、元のApplyとdefinition / device contextが一致する場合
だけ同じplan生成経路へ進みます。

<!-- @code src/core/apply/plan.ts#recordVerifyResult -->

## recordVerifyResult

1件writeした後の**再read結果**を受けて状態を進めます。

引数はackではなく再readで得たwire値です。**ackを成功と見なしません。**
RMKの応答は`output_data`のechoで成否を示すbyteが無く、範囲外indexへのwriteも
成功コード0を返すため、ackからは何も判定できません。

一致しなければそこで中断します。再readの一致は**永続化の証明にはなりません**。
flashへの書き込みは別taskが非同期に行い、失敗しても host へは返らないためです。

<!-- @code src/core/apply/plan.ts#abortApply -->

## abortApply

Applyを中断します。

返す状態は検証済みの**件数**しか持ちません。`plan`も`cursor`も残りのoperationも捨てます。
再開に必要な情報が型として存在しないため、全readからのやり直ししか経路がありません。

これは実測に基づく制約です。電源断を挟んだ場合、**最後にackが返った1 entryは
反映されていない可能性があります**（ADR 0005）。「ackが返ったのだから書けているはず」で
次のdiffを縮めてはいけません。全readはその状態を正しく返すので、取り直せば埋まります。
