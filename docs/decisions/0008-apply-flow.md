# Applyはbackupを前提条件とし、再readだけを成功判定に使い、中断したら全readからやり直す

状態: 採用

2026-08-19に、ADR 0005 が確定させた失敗モードを前提に、Applyの状態機械を
実機I/Oから切り離した純関数（`src/core/apply/`）として実装し、testで確認して決めた。
実機操作は行っていない。

## 背景

ADR 0005 が結論の大半を先に確定させている。writeは単一entry commandに限り、ackを成功と
見なさず、復旧はbackupからの再writeで閉じる。Applyの必須手順も
「全read backup → validation → diff → 人間確認 → 1件ずつwrite + 再read →
失敗したら中断し全readからやり直す」として示されている。

したがってD-005に残っているのは、それを**破れない形にする**方法と、
ADR 0004・0005 が明示的にD-005へ送った未確定値の確定である。

- 往復timeoutの確定値。ADR 0004 が初期値3000msを置き、R-004 / R-005 の両ログが
  「D-005で決める」と記録していた
- AI / CLIからのwrite境界を、実装上どこで線を引くか
- 「ackが返ったのだから書けているはず」でdiffを縮めない、をコード上どう保証するか

実測（BLE、firmware V1.12）で確定している数値は以下（ADR 0005）。

- read単発 p50 30.0ms / max 512.4ms、write単発 p50 45.0ms / p95 174.7ms
- 空き269箇所への連続write中に電源を切ると、ackが返った17件のうち残ったのは16件。
  **ackとflashのズレは実在し、その幅は1 entry**。残った位置と消えた位置の境界は連続していた

## 選択肢

1. Applyの手順を手続きとして書き、前提条件は実行時のフラグとassertionで守る
2. Applyを状態機械として型で表し、前提条件を引数と型で強制する。
   中断状態には未完了の差分を持たせない
3. Applyをadapter（WebHID層）の内部に閉じ、coreは差分の計算だけを担う

## 決定

案2を採る。

- **backupは`createApplyPlan`の引数**にする。backupが無ければ計画そのものを作れない。
  空のbackupは`ApplyPreconditionError`で弾く。「backupが取れなければwriteへ進まない」を
  上位のフラグではなく型と引数で守る
- **状態を進める関数が受け取るのは再readの値だけ**にし、ackを引数に取らない。
  `recordVerifyResult(state, observed)`はackを表現する型を持たないので、
  ackを成功判定に使うコードが書けない
- **中断状態は`plan`も`cursor`も残りのoperationも持たない**。検証済みの件数しか持たせない。
  中断後に再開しようとしても、再開に必要な情報が型として存在しない。
  再接続後の全readとdiff再計算しか経路が無くなる
- **往復timeoutは3000msのまま確定する**。値はtransportで変えない（ADR 0004）
- **write commandの許可リストに単一entryの5種類だけを載せる**。
  keymap `0x05`、encoder `0xFE 0x04`、tap dance / combo `0xFE 0x0D`、settings `0xFE 0x0B`。
  `0x13`、`0x0F`、`0x0A`、`0x0B`、`0x06`、`0x15`は許可リストに載せない
- **rollbackに専用経路を持たせない**。`createRollbackPlan`はbackupを目標として
  `createApplyPlan`を呼ぶだけにする
- backupのkeyboard uidが接続中の実機と一致することを確認する

## 理由

- 案1は前提条件がassertionの書き忘れで消える。Applyの前提条件は「守り忘れると
  ユーザーの設定を静かに壊す」種類のもので、レビューでの担保に頼るには影響が大きい
- 中断状態に`plan`を残すと、「途中まで書けているから残りだけ書けばよい」というコードが
  自然に書けてしまう。ADR 0005 の実測では、電源断時に**最後にackが返った1 entryが
  flashに載っていなかった**。残りだけを書くとその1件が抜けたまま完了扱いになる。
  型として残差を持たせないことでこの経路を塞ぐ
- ackを引数に取らないのは、ackから判定できることが実際に何も無いため。RMKの応答は
  `output_data`のechoで成否を示すbyteが無く、範囲外indexへのwriteも成功コード0を返す。
  `MorseSet` / `ComboSet`に至っては範囲外チェックより前に0を書く
- timeoutを詰めない理由は、max 512.4msの由来が未確認であることと、
  `sequential-storage`のGCがwrite latencyへ与える影響が未測定であること。
  正常なwriteをtimeoutと誤判定すると、Apply全体のやり直し（全read + diff再計算）になる。
  BLEの全readは7秒かかるため、誤判定の代償は待ち時間より大きい
- **reset系を実装しないことがそのままAI / CLIの境界の実体になる**（ADR 0005）。
  権限フラグで分岐させる方式は、分岐を消し忘れると効かなくなる。commandが存在しなければ
  呼びようがない。許可リストにreset系が無いことをtestで固定した
- 案3はcoreがApplyの安全性を保証できなくなる。CLIとUIが別のadapterを持ったときに、
  前提条件が二重に実装されて片方だけ間違う

## 影響

- Applyの状態機械はWebHIDにもReactにもfilesystemにも依存しない。
  実機との往復はadapterが行い、結果だけを渡す。adapterは未実装
- 差分N件のwriteは2N往復になる。BLEでwrite p50 45.0msなのでN=50で約4.5秒。
  進捗は往復数ベースで出す（ADR 0004）
- backupはApplyごとに保存し、UIから復元できる導線を持つ。**置き場所はD-004で決める**
- validationのうちどれをApply blockingにするかは、severity modelを決めるD-003 の範囲。
  現状の状態機械はvalidationの結果を引数に取らない。D-003 の後に前提条件として足す
- macroは当面write経路を持たない。`keymap.yaml`でmacroを扱うかはD-002
- 永続化まで確認したい場合は、電源再投入と再readをユーザー操作として案内する。
  UIは「実機に反映した」と表示し、保存や永続化を保証する文言を使わない（ADR 0005）
- writeはidempotentなので応答が来ない場合の再送を許すが、再送もtimeoutと競わせる。
  再送の実装はadapter側の責務で、状態機械は再送を区別しない
