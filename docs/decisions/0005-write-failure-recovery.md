# 実機writeは単一entry commandに限り、ackを成功と見なさず、復旧はbackupからの再writeで閉じる

状態: 採用

2026-08-18に、Cornix LPのfirmwareであるRMK（tag `rmk-v0.8.2`）のwrite経路とstorage実装を読み、
故障を注入できるmock（Spike: `spikes/r-005-write-failure/`）で失敗モードを再現し、
実機（BLE接続、firmware V1.12）でwriteと電源断を実測して決めた。

## 背景

Applyフロー（AGENTS.md）はread → backup → validation → diff → 人間確認 → 差分write → 再readと進む。
このうちwrite以降を設計するには、writeが中断・部分成功したときにCornix LPがどの状態になり、
hostが何を観測できるのかを確定させる必要がある。

R-005の調査（詳細は`docs/tasks/ai-logs/2026-08-18_r-005-write-failure.md`）で以下が確認できた。
前半はRMKとvial-guiの実装から、後半はmockでの再現から得たもの。

- RMKのvial taskは「RAM上のkeymapを更新」→「`FLASH_CHANNEL`へ送る」→「応答を返す」の順で動く
  （`rmk/src/host/via/mod.rs`の`process()`）。flashへの書き込みは別taskが非同期に行い、
  **失敗しても`error!`を出すだけでhostへは返らない**（`rmk/src/storage/mod.rs`の`run()`）
- 応答は`input_data = output_data`のecho。writeのack に成否を示すbyteは無い。
  `MorseSet` / `ComboSet`だけは先頭byteに0（成功）を書くが、**範囲外indexのbounds checkより前に書いている**
- 起動時はflash上のitemからkeymapを組み直す（`rmk/src/host/storage.rs`の`read_keymap`）。
  itemは`(layer, row, col)`ごとに独立したkey（`0x1000 + 線形index`）で入る
- `check_enable()`がfalseだと**storageをerase_allしてfirmware既定値で作り直す**。
  build hashの比較はコメントアウトされており、firmware更新では消えない
- writeを塞ぐlockは無い。`vial_unlocked`を見るのは`SwitchMatrixState`だけで、
  keymap / encoder / tap dance / combo / settingsのwriteはlock状態を一切参照しない
  （`rmk/src/host/via/vial_lock.rs`と各handler）
- `DynamicKeymapSetBuffer`(`0x13`)はread(`0x12`)と非対称。readはoffsetをbyte単位で見てBEで返し、
  writeはoffsetをentry単位で見てLEで読む。さらにwrite側だけ`try_send`を使うため、
  `FLASH_CHANNEL`（容量4）が埋まると**flash書き込みが黙って捨てられる**
- RMKで動かないwrite commandがある。`DynamicKeymapReset`(`0x06`)と
  `DynamicKeymapSetEncoder`(`0x15`)は`warn!`を出すだけ、`BootloaderJump`(`0x0B`)は
  **unlockを確認せず即座にbootloaderへ飛ぶ**
- vial-guiも差分writeしかしない。`set_key` / `set_encoder`は値が変わったentryだけを
  1件ずつ送り、`hid_send`は同じpacketを最大20回再送する（v0.7.1）

mockでの再現（`nix develop -c node spikes/r-005-write-failure/self-check.mjs`）。

| 失敗                     | ack       | 再read         | 電源再投入後     | 再readで検出 |
| ------------------------ | --------- | -------------- | ---------------- | ------------ |
| flash書き込みが失敗した  | あり      | 新しい値       | **元の値へ戻る** | **不可**     |
| storage taskが停止した   | 4件まで   | 以降timeout    | —                | 可           |
| write途中で切断した      | 途中まで  | 適用済みは残る | 同じ             | 可           |
| 範囲外indexへwriteした   | あり（0） | 変化なし       | 変化なし         | 可           |
| `0x13`で28 entryを送った | あり      | 全件変わる     | 先頭4件のみ      | **不可**     |
| `0x13`にsize=28を渡した  | なし      | 以降応答なし   | —                | 可           |

最後の行が重要で、VIA / vial-guiの`size`はbyte数だがRMKはentry数として扱う。
その値をそのまま送るとRMKは32 byteのreportを超えて読みにいき、Rustのslice indexでpanicする。

実機での実測（詳細は作業ログ）。BLE接続、電源スイッチによる電源断で確認した。

- 単一entry write（`0x05`）で書いた値は、**電源断を越えて残った**。
  uptime（`0x02 0x01`）が565秒から52秒へ巻き戻ったことで再起動を確認している
- 空き269箇所へ連続writeし、その最中に電源を切ったところ、
  **ackが返ったのは17件、電源断後に残っていたのは16件**だった。
  最後にackが返った1件だけがflashに載っていない
- 残った位置と消えた位置の**境界は連続**しており、順序の入れ替わりも、
  別の位置へ入ったwriteも1件も無かった（値をindexから決めて突き合わせた）
- writeの往復はreadより遅い。read単発がp50 30.0msなのに対し、
  write（verifyなし）はp50 45.0ms / p95 174.7ms

つまり**ackとflashのズレは実在し、その幅は1 entry**である。
`FLASH_CHANNEL`へ送った直後にackを返すという実装から予測される挙動と一致した。

## 選択肢

1. vial-guiと同じくackを成功と見なし、Apply後に全readで突き合わせる
2. 差分を1件ずつwriteし、その都度同じentryを読み直してverifyする。
   永続化は電源再投入でしか確認できないと明示し、通常のApplyでは要求しない
3. Applyのたびに電源再投入を求め、flashに載ったことまでverifyしてから完了とする

## 決定

案2を採る。

- writeは**単一entryのcommandだけ**を使う。keymapは`0x05`、encoderは`0xFE 0x04`、
  tap dance / comboは`0xFE 0x0D`の`0x02` / `0x04`、settingsは`0xFE 0x0B`。
  `0x13`（keymap bulk）と`0x0F`（macro buffer）は使わない
- 送らないcommandを実装側に持たない。`0x0A` EepromReset、`0x0B` BootloaderJump、
  `0x06` DynamicKeymapReset、`0x15` DynamicKeymapSetEncoderはcommand table自体に載せない
- **ackを成功と見なさない**。1件writeするごとに同じentryを読み直し、意図した値かを確認する。
  一致しなければそこで中断する
- 再readが一致しても**永続化の証明にはならない**ことを設計上の前提とする。
  UIは「実機に反映した」と表示し、保存や永続化を保証する文言を使わない
- writeはidempotentなので、応答が来ない場合の再送を許す。ただし再送も往復timeoutと競わせる
- 中断したら**未完了の差分を状態として持ち回らない**。再接続後は全readからやり直し、
  target / currentのdiffを取り直す
- rollbackはfirmwareの機能ではなく、**backupの値を同じ差分writeで書き戻す操作**として定義する。
  Apply前の全read backupを必須の前提条件にする
- 永続化まで確認したい場合は、電源再投入と再readをユーザー操作として案内する。アプリが自動では行わない

## 理由

- 案1のackは「vial taskが生きている」以上の意味を持たない。範囲外indexへのwriteは成功コード0を返し、
  `SetEncoder`と`SetBehaviorSetting`はechoを返すだけで、silent no-opと成功を区別できない
- 案3は毎回のApplyに全read（BLEで7秒）と電源再投入を課す。flash書き込みの失敗はstorageが
  壊れているか満杯のときにしか起きず、常時警戒するには代償が大きすぎる
- 部分状態は安全に再開できる。適用済みのentryは`(layer, row, col)`単位で独立したflash itemになり、
  中断しても巻き戻らず、触っていないentryを壊しもしない。実機でも、適用済みは連続した前半部分として
  残り、順序の乱れも誤った位置への書き込みも観測されなかった。
  だから「途中まで適用された実機」を次のApplyの入力として扱える
- 電源断を挟んだ場合、実機のRAMはflashから作り直されるため、**再接続後の全readは
  永続化された状態そのものを返す**。復旧に必要なのは全readとdiffの再計算だけで足りる
- rollbackをfirmwareへ期待できない。transactionは無く、`EepromReset`はfirmware既定へ戻すだけで
  ユーザーの元の状態には戻さない。復元元はhost側のbackupしか存在しない
- 全buffer write（`0x13`）は、readとの非対称、`try_send`の取りこぼし、sizeの解釈違いによるpanicの
  3つが重なる。1つでもあれば避けるに足りる。ADR 0003の「差分writeに限る」の根拠がここで確定した
- lockはwriteを守らない。unlockを前提にした安全策（lock中はwriteできないはず）を設計に入れると、
  実際には成立しない保護を当てにすることになる

## 影響

- D-005のApplyは「全read backup → validation → diff → 人間確認 → 1件ずつwrite + 再read →
  失敗したら中断し全readからやり直す」を必須手順とする。backupが取れなければwriteへ進まない
- 差分N件のwriteは2N往復になる。writeの往復はreadより遅く、実測でp50 45.0ms。
  N=50なら約4.5秒かかる。進捗表示は往復数ベースで出す（ADR 0004と同じ）
- Applyが電源断で中断した場合、**最後にackが返った1 entryは反映されていない可能性がある**。
  再接続後の全readはその状態を正しく返すので、diffを取り直せば次のApplyで埋まる。
  「ackが返ったのだから書けているはず」という前提でdiffを縮めてはいけない（D-005の入力）
- verifyの比較単位はADR 0003のまま。write側も同じ単位で1件ずつ突き合わせる（D-003の入力）
- backup JSONはApplyごとに保存し、UIから復元できる導線を持つ。置き場所はD-004で決める
- macroは当面write経路を持たない。RMKの実装が途中で、`0x0F`はbuffer全体をflashへflushする。
  `keymap.yaml`でmacroを扱うかはD-002で決める
- AI / CLIからのwrite境界は「単一entry commandのみ」で線を引ける。reset系を実装しないことが
  そのまま境界の実体になる（D-005の入力）
