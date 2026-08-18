# 2026-08-18 R-005 実機write失敗時の状態と復旧方法を調査する

対象Issue: #5 `[R-005] 実機write失敗時の状態と復旧方法を調査する`

実機検証は2026-08-18に完了した。macOS 26（Darwin 25.5.0）+ Chromium系browser、
Cornix LP firmware V1.12、**BLE接続**、write操作はすべてユーザーが実行している。
前半はRMK / vial-guiの実装読解とmockでの再現、後半が実機の実測。

## 調査方法

- Cornix LPのfirmwareはRMKであってvial-qmkではない（R-004で確定）。したがってwriteの挙動は
  RMK側の実装が決まりとなる。tag `rmk-v0.8.2`の`rmk/src/host/via/mod.rs` /
  `host/via/vial.rs` / `host/via/vial_lock.rs` / `host/storage.rs` / `storage/mod.rs` /
  `channel.rs`と、`rmk-types/src/protocol/vial.rs`、`rmk-config/src/lib.rs`を読んだ
- host側の期待挙動として、vial-gui v0.7.1の`src/main/python/protocol/keyboard_comm.py`
  （`set_key` / `set_encoder` / `restore_layout` / `qmk_settings_set`）と
  `src/main/python/util.py`の`hid_send`を読んだ
- Spike `spikes/r-005-write-failure/`を作り、R-003のmock deviceにwrite commandと
  RAM / flashの分離、故障注入を足して失敗モードを再現した
- 実機へのwriteはAGENTS.mdの禁止操作にあたるため、AIからは一切送っていない。
  `index.html`に手順0〜7のボタンを用意し、ユーザーが押した。電源断も同様

## Fact

### writeがackを返す時点で何が終わっているか

- `VialService::process()`は`process_via_packet()`の完了後に`write_report()`する。
  packet処理がしているのは「RAM上のkeymapを更新」と「`FLASH_CHANNEL`へ送る」だけで、
  flashへの書き込みは含まない（`rmk/src/host/via/mod.rs`）
- flashへの書き込みは`Storage::run()`が`FLASH_CHANNEL.receive()`で受けて`store_item`する別task。
  失敗すると`print_storage_error`でlogを出し`FLASH_OPERATION_FINISHED.signal(false)`するだけで、
  **hostへは何も返らない**（`rmk/src/storage/mod.rs`）
- したがってackは「vial taskが生きていてRAMを更新した」ことしか示さない
- `FLASH_CHANNEL`の容量は`rmk-config`の`flash_channel_size`既定値で**4**。
  単一entryのwriteは`send().await`（backpressureあり）、`DynamicKeymapSetBuffer`だけ
  `try_send`（満杯なら破棄）

### 応答の中身

- `process_via_packet`の冒頭で`report.input_data = report.output_data`。
  write系の応答は基本的に送ったpacketのechoで、成否を示すbyteが無い
- `MorseSet` / `ComboSet`は`input_data[0] = 0`（成功）を書くが、**bounds checkより前**に書いている。
  存在しないindexを指定しても0が返る
- `SetBehaviorSetting`は返り値を書かない。`input_data[0]`はechoの`0xFE`のまま返る。
  vial-guiの`qmk_settings_set`は`data[0]`を成否として返すため、RMK相手では常に非0になる
- `SetEncoder`はlayer / indexが範囲外だと何もせずechoだけ返す

### 電源を入れ直したときに残るもの

- 起動時は`fetch_all_items`でflash上のitemを走査し、keymapとencoderを組み直す
  （`rmk/src/host/storage.rs`の`read_keymap`）
- keymapのitem keyは`0x1000 + (layer * ROW * COL + row * COL + col)`で、
  **`(layer, row, col)`ごとに独立**（`rmk/src/storage/mod.rs`の`get_keymap_key`）。
  encoderは`0x4000 + idx + NUM_ENCODER * layer`、comboは`0x3000 + idx`、morseは`0x7000 + idx`
- 初回起動時は`initialize_storage_with_config`がfirmware既定のkeymapを全件flashへ書く
- `check_enable()`がfalseだと`erase_all`してfirmware既定値で初期化し直す。
  初期化に失敗した場合は`enable: false`を書き戻すため、次回起動でも同じ経路に入る
- `check_enable()`のbuild hash比較はコメントアウトされている。firmware更新でstorageは消えない

### write系commandのRMKでの扱い

| command                            | RMKでの挙動                                          |
| ---------------------------------- | ---------------------------------------------------- |
| `0x05` DynamicKeymapSetKeyCode     | keycodeをBEで読み、RAM更新 + flashへ`send().await`   |
| `0x13` DynamicKeymapSetBuffer      | offsetをentry単位・値をLEで読む。flashへは`try_send` |
| `0x0F` DynamicKeymapMacroSetBuffer | offset 0でmacro cache全体を0にしてから書く           |
| `0x03` SetKeyboardValue            | LayoutOptionsのみ。RAMには反映されない               |
| `0x06` DynamicKeymapReset          | `warn!`のみ。何もしない                              |
| `0x15` DynamicKeymapSetEncoder     | `warn!`のみ。何もしない                              |
| `0x0A` EepromReset                 | `erase_all`。次回起動でfirmware既定へ戻る            |
| `0x0B` BootloaderJump              | **unlockを確認せず**即座にbootloaderへ飛ぶ           |
| `0xFE 0x04` SetEncoder             | keycodeをBEで読む。範囲外は無言でno-op               |
| `0xFE 0x0B` SetBehaviorSetting     | qsid / 値をLEで読む。未対応qsidは無言でno-op         |
| `0xFE 0x0D 0x02` MorseSet          | 値をLE。timeoutはhold / gapの両方へ入る              |
| `0xFE 0x0D 0x04` ComboSet          | 値をLE。`layer`は常に`None`で作り直される            |

### `0x13`を使ってはいけない理由（ADR 0003からの持ち越し分）

- read（`0x12`）は`skip(offset / 2)`・`take(size / 2)`でBEで返す。offsetはbyte単位
- write（`0x13`）は`skip(offset)`・`take(size)`でLEで読む。offsetはentry単位
- したがってreadで得たoffsetをそのままwriteに使うと、**2倍ずれた位置に、byteが入れ替わった値**が入る
- さらにwrite側は`report.output_data[idx..idx + 2]`をentry数ぶん読む。VIA / vial-guiの`size`は
  byte数（<= 28）なので、その値を渡すと32 byteのreportを超えて読みにいき、
  Rustのslice indexで**panicする**
- flashへは`try_send`なので、1 packetで多数のentryを書くと`FLASH_CHANNEL`（容量4）を超えたぶんが
  黙って捨てられる。RAMには載るため再readでは一致し、電源を入れ直すと消える

### lockはwriteを守らない

- `vial_unlocked`を参照するのは`GetKeyboardValue`の`SwitchMatrixState`だけ
  （`rmk/src/host/via/mod.rs`）。keymap / encoder / tap dance / combo / settingsのwriteは
  lock状態を一切見ない
- `vial_lock` featureが無効なbuildでは`GetUnlockStatus`が常に`unlocked = 1`を返す。
  Cornix LPでどちらなのかは、`0xFE 0x05`を1往復読めば分かる（実機手順の0に入れた）
- `BootloaderJump`もRMKではunlockを確認しない。vial-qmkは確認するため、ここは実装が異なる

### vial-guiのwrite手順

- `set_key` / `set_encoder`は、host側で保持している現在値と異なるentryだけを1件ずつ送る差分write
- `restore_layout`（`.vil`の復元）も同じ`set_key`を全位置に対して呼ぶだけで、bulk writeは使わない
- `hid_send`は読み取りtimeout 500msで、失敗すると0.5秒待って**同じpacketを再送**する（既定20回）。
  write commandがidempotentであることが前提になっている

## Spike結果

`spikes/r-005-write-failure/`

- `mock-persistence.mjs`がR-003のmockを包み、RAM（readが返す値）とflash（再起動後に残る値）を
  分けて持つ。`FLASH_CHANNEL`の容量4、`send().await`のbackpressure、`try_send`の取りこぼし、
  `store_item`の失敗、切断後の永久pending、32 byte未満packetの破棄を注入できる
- `write-probe.mjs`はR-004の`VialSession`を再利用し、差分を1件writeするごとに
  同じentryを読み直す`applyDiff`を提供する。`0x13`とreset系は実装していない
- `self-check.mjs`が13シナリオを流し、23件の想定を満たすことを確認した。得られた表は以下

| ケース                            | ack                   | 再read                | 再起動後         | 再readで検出      |
| --------------------------------- | --------------------- | --------------------- | ---------------- | ----------------- |
| 正常にwriteできた                 | あり                  | 新しい値              | 新しい値         | —                 |
| flash書き込みが失敗した           | あり                  | 新しい値              | **元の値**       | **不可**          |
| storage taskが停止した            | 4件まで               | 以降timeout           | —                | 可                |
| write途中で切断した               | 途中まで              | 適用済みは残る        | 同じ             | 可                |
| 切断後のHIDDeviceを使い回した     | なし                  | timeout               | —                | 可（timeout必須） |
| 32 byte未満で送った               | なし                  | 変化なし              | 変化なし         | 可（timeout）     |
| lockされたままwriteした           | あり                  | 新しい値              | 新しい値         | —                 |
| 範囲外indexへwriteした            | あり（return code 0） | 変化なし              | 変化なし         | 可（再read）      |
| EepromResetを送った               | あり                  | 変化なし              | **firmware既定** | 可（再起動後）    |
| backupの値を書き戻した            | あり                  | 元の値                | 元の値           | —                 |
| `0x13`をreadと同じoffsetで使った  | あり                  | **別のentryが変わる** | 同じ             | 可（再read）      |
| `0x13`で14 entryを一度に送った    | あり                  | 全件変わる            | **先頭4件のみ**  | **不可**          |
| `0x13`にsize=28（byte数）を渡した | なし                  | 以降応答なし          | —                | 可（timeout）     |

- 部分状態は巻き戻らない。切断時点までに適用されたentryは電源を入れ直しても残り、
  未適用のentryは元のまま。keymapのflash itemが`(layer, row, col)`ごとに独立しているため
- rollbackはbackupの値を同じ差分writeで書き戻すだけで成立する。firmware側の機能は要らない

## Fact（実機測定）

環境: macOS（Darwin 25.5.0）、Chromium系browser、Cornix LP firmware V1.12、BLE接続。
生データは`~/Downloads/r-005-*.json`（コミットしていない）。

### 単一writeは電源断を越えて残る

- layer 9の`(0,0)`（definition宣言済みで値は`0x0000`、layer 9はほぼ未使用）へ
  `0x05` DynamicKeymapSetKeyCodeで書き、再readで一致を確認した
- 電源スイッチを切って入れ直したあと、同じ位置を読んで**値が残っていた**
- 再起動したことは**uptime**（`0x02 0x01`、RMKの`Instant::now().as_millis()`）で確認した。
  565462ms → 52455msへ巻き戻っている。BLE切断だけでは電源が落ちないため、この確認は必須

### write中に電源を切ると、ackより1件少なく残る

layer 9〜5の**現在`0x0000`の位置269件**へ、verifyの再readを挟まず連続writeし、
その最中に本体の電源スイッチを切った。値はindexから決めているため、
別の位置へ入ったwriteがあれば読み戻しで検出できる。

| 観測                     | 値                                |
| ------------------------ | --------------------------------- |
| 対象                     | 269件                             |
| ackが返った              | **17件**                          |
| 電源断後に残っていた     | **16件**                          |
| 消えていた               | 253件                             |
| 値が位置と対応しないもの | **0件**                           |
| 最後に残ったindex        | 15                                |
| 最初に消えたindex        | 16                                |
| 停止の検出               | `sendReport`でのtimeout（3000ms） |

- **ackが返った最後の1件だけがflashに載っていない**。
  `FLASH_CHANNEL`へ送った直後にackを返す実装から予測されるとおりの結果
- 境界は連続しており、順序の乱れも誤配置も無い。部分適用は常に「先頭からN件」の形になる
- 電源断の検出は`sendReport`が返らないことによる。R-004で観測した永久pendingと同じ形で、
  timeoutが無ければ無言で止まる

### 往復latency（BLE）

| 操作                           | 往復 | 総時間 | p50    | p95     | max     |
| ------------------------------ | ---- | ------ | ------ | ------- | ------- |
| 全read（backup）               | 168  | 5.56s  | 30.0ms | 31.5ms  | 437.7ms |
| 空き位置の走査（read 1件ずつ） | 280  | 9.55s  | 30.0ms | 40.5ms  | 484.2ms |
| 連続write（verifyなし）        | 17   | 0.96s  | 45.0ms | 174.7ms | 174.7ms |
| 読み戻し（read 1件ずつ）       | 269  | 13.39s | 30.2ms | 77.1ms  | 539.9ms |

- **writeの往復はreadより遅い**（p50で30.0ms → 45.0ms）
- 全readは5.56s。R-004の実測（7.03s）より速い。同じ168往復でp50は43.7ms → 30.0ms

### 権限とdeviceの見え方

- reload後も`getDevices()`が3件を返した。権限は永続化されている（R-004と一致）
- ただし**権限はorigin単位**で、R-004の`:8173`とR-005の`:8175`は別origin。
  初回の`getDevices()`は0件になり、`requestDevice`をやり直す必要がある
- 電源断でも3つの`HIDDevice`すべてに`disconnect`が飛び、再接続で`connect`が3つ飛ぶ。
  切断前のdeviceは再利用できず、`getDevices()`から取り直した（R-004と一致）

## Inference

- flash書き込みが実際に失敗する条件は、`SSError::FullStorage`（`sequential-storage`が
  GCしても空きを作れない）と`Corrupted`が中心と見られる。通常運用の頻度は低いと考えられるが、
  発生を**hostから観測できない**ことは実装の有無に関わらず成立する
- `check_enable()`がfalseになる経路は、初期化失敗時に`enable: false`が書き戻される場合と、
  storageが壊れて`StorageConfig` itemを読めない場合。前者は`initialize_storage_with_config`の
  失敗が前提なので、日常のwriteから直接入る経路ではないと考えられる
- Cornix LPが`vial_lock` featureを有効にしているかは実機の`GetUnlockStatus`でしか分からない。
  ただし有効でもwriteは塞がれないため、Applyの設計はどちらでも変わらない
- `0x13`のpanicはRustのslice indexに由来するため、no_stdのembassy buildでは
  panic handlerの設定次第でhaltかresetになる。どちらでも実機は一度落ちる。実機では試さない

## Decision

ADR `docs/decisions/0005-write-failure-recovery.md`（状態: 採用）に記録した。
writeは単一entry commandに限り、ackを成功と見なさず、1件ごとに再readでverifyする。
再readは永続化の証明ではないと設計上明示し、rollbackはbackupからの差分再writeとして定義する。
中断時は未完了の差分を持ち回らず、再接続後に全readからdiffを取り直す。

## Open Question

- ~~実機での検証が未了~~ → **解決**（2026-08-18、BLE接続で実施）。
  単一writeは電源断を越えて残り、連続write中の電源断では
  ackより1件少ない件数だけが残った。writeの往復はreadより遅い（p50 45.0ms / 30.0ms）
- **USB接続での再測が未了**。今回はBLEのみ。R-004ではread結果が全byte一致したが、
  writeのlatencyとack / flashのズレ幅がtransportで変わるかは未確認
- ackとflashのズレが**常に1 entryなのか**は1回の測定では言えない。
  storage taskが`store_item`にかける時間とwriteの間隔次第では複数件になりうる。
  再現を取るなら、writeの間隔を変えて数回繰り返す必要がある
- Cornix LPの`GetUnlockStatus`が返す値（`vial_lock` featureの有効 / 無効）は未取得。
  writeがlockに影響されない以上Applyの設計は変わらないため、優先度は低い
- `sequential-storage`のGCが走るタイミングとwrite latencyへの影響は未確認。
  1往復の応答が遅くなる可能性があるが、実測しないと分からない
- flashの摩耗。差分writeは1 entryにつき1 itemを追記するため、Applyを繰り返すとGCが頻発する。
  MVPの利用頻度では問題にならないと考えているが、根拠となる数値は無い
- 往復timeoutは一律3000msのまま（R-004から持ち越し）。writeの往復がreadより遅いかは
  実機で測る必要があり、値の確定はD-005で行う
- macroのwrite（`0x0F`）は経路として採らないと決めたが、RMKの実装が完成した場合に
  何が変わるかは追っていない。D-002でmacroを扱うかどうかを決めるときに再確認する
