# WebHIDのdeviceは0xFF60 collectionで選び、transportに依存しない単一sessionでApplyを閉じる

状態: 提案中

実機（USB / BLE）での確認が未了。確認後に「採用」へ更新するか、結論を差し替える。

## 背景

Applyフロー（AGENTS.md）はread → backup → validation → diff → write → 再readを
一連の操作として行う。Cornix LPはUSBとBLEの両方で接続でき、R-003で確定したread flowは
168往復ある。macOS + Chromiumで、この往復をどちらのtransportでも同じコードで通せるのか、
また接続や権限がどこで切れうるのかを決めないと、UIとerror処理の形が決まらない。

R-004の調査（Spike: `spikes/r-004-webhid-macos/`）で、実機なしに以下が確認できた。

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
- 権限はephemeralである前提で組む。起動時に`getDevices()`が空でも異常として扱わず、
  chooserを出す導線を常に持つ
- timeoutは往復ごとに設ける。値はtransportで変えず、実測のp95から一律に決める

## 理由

- 案1は分岐の根拠になるtransport情報がそもそもJSへ来ない。分岐しようがない
- read flowはUSBでもBLEでも同じcommand列・同じ32 byte reportで、
  差は往復latencyとdisconnectの起きやすさだけになる。これはtimeoutと中断で吸収できる
- 168往復の途中で切断された場合、read結果は部分的でbackupにならない。
  session単位で中断する方が、部分状態を持ち回るより壊れ方が単純
- 権限が永続化されるかはserial numberの有無に依存し、BLEでmacOSがserialを
  どう見せるかは未確認。永続化を前提にすると、されなかった場合に導線が消える
- 案3はCornix LPが無線前提のキーボードである以上、MVPの価値を大きく削る。
  非対応にするのは実機で動かないと確認できてからでよい

## 影響

- 168往復の総時間はtransportで大きく変わりうる。BLEのconnection intervalが
  往復ごとに効くため、進捗表示は往復数ベースで出す必要がある
- Applyのたびにchooserが出る可能性がある。UIは「毎回選び直す」を許容する形にする
- BLE経由でVial collectionがmacOSに見えるかは未検証。見えない場合、この判断のうち
  transport非依存の部分だけが残り、BLE対応は別の判断になる
- 同一の物理deviceが複数の`HIDDevice`として見える場合（USB / BLEを同時に接続した場合を含む）、
  どれを選ぶかはユーザーに委ねる。アプリ側で自動選択しない
