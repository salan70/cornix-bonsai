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

<!-- @code src/core/apply/plan.ts#createApplyPlan -->

## createApplyPlan

backupと目標状態から差分を計算します。

**backupは引数です。無ければ計画そのものを作れません。** 空のbackupは
`ApplyPreconditionError`で弾きます。firmwareにrollback機能は無く、復元元は
host側のbackupしか存在しないため、backupはwriteの前提条件です。

目標にあってbackupに無いtargetは差分に含めません。実機がそのentryを持たない可能性があり、
容量は実機が申告するものだからです（ADR 0003）。

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
