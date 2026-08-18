# WebHIDのdeviceは0xFF60 collectionで選び、transportに依存しない単一sessionでApplyを閉じる

状態: 採用

2026-08-18にmacOS + Chromium系browser、Cornix LP firmware V1.12で、USB / BLEの双方を実測した。

## 背景

Applyフロー（AGENTS.md）はread → backup → validation → diff → write → 再readを
一連の操作として行う。Cornix LPはUSBとBLEの両方で接続でき、R-003で確定したread flowは
168往復ある。macOS + Chromiumで、この往復をどちらのtransportでも同じコードで通せるのか、
また接続や権限がどこで切れうるのかを決めないと、UIとerror処理の形が決まらない。

R-004の調査（Spike: `spikes/r-004-webhid-macos/`）で以下が確認できた。前半はprotocol / browser実装から、
後半は実機の実測から得たもの。

- Cornix LPのVial用collectionはusage page `0xFF60` / usage `0x61`、input / output各32 byte、
  report IDなし。RMKの`ViaReport`（`rmk/src/descriptor.rs`）はUSBとBLEで同じdescriptorを使う
- BLEではRMKがHID over GATTのservice instanceを分けており、Vialは
  keyboard用とは別のHID service（`rmk/src/ble/host_service/vial.rs`）として出る。
  hostはinput characteristicのnotifyを購読し、outputへ**ちょうど32 byte**を書く。
  RMKは長さが32でないwriteを捨てる（`rmk/src/ble/mod.rs`）
- ChromiumはmacOSでIORegistryの`IOHIDDevice`を列挙し、bus typeを**常にUSBと報告する**
  （`services/device/hid/hid_service_mac.cc`、`TODO(reillyg): Detect Bluetooth. crbug.com/443335`）。
  JSからtransportを判別する手段はない
- Chromiumのblocklistが落とすのはFIDO usage pageと特定のVID / PIDだけ。
  keyboard / pointer collectionはreportが隠されるがdevice自体は列挙される
  （`third_party/blink/renderer/modules/hid/hid_device.cc`の`IsProtectedReportType`）。
  `0xFF60`は保護対象ではない
- WebHIDの権限は、serial numberとproduct nameの両方が空でない場合だけ永続化される
  （`chrome/browser/hid/hid_chooser_context.cc`の`CanStorePersistentEntry`）。
  それ以外はephemeralで、切断やbrowser終了で失われる。WebHIDはserial numberをJSへ出さないため、
  永続化されるかどうかはgetDevices()の結果からしか観測できない

実機の実測（詳細は`docs/tasks/ai-logs/2026-08-18_r-004-webhid-macos.md`）。

- 1台が**3つの`HIDDevice`**に割れる（Vial / keyboard / mouse・consumer・system control）。
  USBでもBLEでも同じ3分割で、`0xFF60` / `0x61`のfilterで1つに絞れる
- **BLE接続時もVial collectionが見える**。macOSは2つ目以降のHID over GATT serviceも
  IOHIDDeviceとして生やしている
- 168往復の実測は**USB 340ms（p50 2.0ms） / BLE 7.03s（p50 43.7ms、max 512.4ms）**。
  **read結果はUSBとBLEで全byte一致**した
- 権限は**永続化される**。reload後の`getDevices()`が3件を返した
- **切断前の`HIDDevice`は再利用できない**。`opened`が`true`のまま`sendReport`が
  解決も拒否もせず永久にpendingになる。再接続後は`getDevices()`から取り直す必要がある

## 選択肢

1. transportごとに接続層を分け、USB用とBLE用で別のread / write経路を持つ
2. transportを区別せず、`0xFF60` / `0x61` collectionを持つHIDDeviceだけを対象にする。
   transport差はtimeoutと進捗表示で吸収する
3. USBのみを対象とし、BLE接続時は明示的に非対応とする

## 決定

案2を採る。

- device選択は`requestDevice({ filters: [{ usagePage: 0xff60, usage: 0x61 }] })`で行う。
  VID / PIDでは絞らない（definitionのVID / PIDは実機のUSB descriptorと一致しない。ADR 0002）
- `sendReport`は常にreport ID `0x00`・32 byte固定で送る。短い配列を送らない
- transportをUIに表示しない。判別できないものを表示しない
- Applyフローは1回の接続sessionの中で閉じる。session中に`disconnect`が来たら、
  途中まで進んだ操作を継続せず中断する
- `disconnect`を受けたら`HIDDevice`の参照を捨てる。再接続後は必ず`getDevices()`から取り直す。
  切断前のdeviceを使い回さない
- timeoutは往復ごとに必ず設ける。`sendReport`のawaitも含めてtimeoutと競わせる。
  値はtransportで変えず一律とし、初期値は3000msとする
- 起動時に`getDevices()`が空でも異常として扱わず、chooserを出す導線を常に持つ

## 理由

- 案1は分岐の根拠になるtransport情報がそもそもJSへ来ない。分岐しようがない
- read flowはUSBでもBLEでも同じcommand列・同じ32 byte reportで、
  差は往復latencyとdisconnectの起きやすさだけになる。これはtimeoutと中断で吸収できる
- 168往復の途中で切断された場合、read結果は部分的でbackupにならない。
  session単位で中断する方が、部分状態を持ち回るより壊れ方が単純
- 切断後のdeviceは`opened`で見分けられず、`sendReport`が例外も出さずに固まる。
  timeoutを置かないとApplyが無言で止まる
- 権限は実測では永続化されたが、それに依存した導線（chooserを出さない）は、
  serial numberの見え方が変わった環境で機能しなくなる
- 案3はCornix LPが無線前提のキーボードである以上、MVPの価値を大きく削る。
  非対応にするのは実機で動かないと確認できてからでよい

## 影響

- 168往復の総時間はtransportで20倍違う（USB 0.34s / BLE 7.0s）。BLEでは進捗表示が要る。
  表示は往復数ベースで出す（時間からの推定はしない）
- write後verifyの再readもBLEでは7秒かかる。Applyの体感時間はBLEが支配的になる
- 切断検知と再取得はDevice I/O層の責務にする。UI側に`HIDDevice`を持たせない
- read結果がtransportで一致するため、backupや`.vil` exportはtransportを記録しなくてよい
- 同一の物理deviceが複数の`HIDDevice`として見える場合（USB / BLEを同時に接続した場合を含む）、
  どれを選ぶかはユーザーに委ねる。アプリ側で自動選択しない
