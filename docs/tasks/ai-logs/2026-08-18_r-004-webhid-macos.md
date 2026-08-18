# 2026-08-18 R-004 macOSでUSB / Bluetooth経由のWebHIDを検証する

対象Issue: #4 `[R-004] macOSでUSB / Bluetooth経由のWebHIDを検証する`

実機検証は2026-08-18に完了した。macOS 26（Darwin 25.5.0）+ Chromium系browser、
Cornix LP firmware V1.12、USBとBLEの両方で確認している。

## 調査方法

- RMK tag `rmk-v0.8.2`の`rmk/src/descriptor.rs` / `rmk/src/usb/mod.rs` /
  `rmk/src/ble/ble_server.rs` / `rmk/src/ble/host_service/vial.rs` / `rmk/src/ble/mod.rs`を読み、
  USBとBLEでVial用reportがどう出るかを比較した
- Chromium mainの`services/device/hid/hid_service_mac.cc`、
  `services/device/public/cpp/hid/hid_blocklist.cc`、
  `third_party/blink/renderer/modules/hid/hid_device.cc`、`.../hid.cc`、
  `chrome/browser/hid/hid_chooser_context.cc`を読み、macOSでの列挙・保護・権限の規則を確認した
- WICG/webhid #75のChromium実装者コメントで、BT HIDがWebHIDに出る条件を確認した
- Spike `spikes/r-004-webhid-macos/`を作り、read flowのcommand組み立てを
  R-003のmock deviceに対して実機なしで検証した

## Fact

### deviceの見え方

- Vial用のHID collectionはusage page `0xFF60` / usage `0x61`、input / output各32 byte、
  report IDなし。RMKは`ViaReport`のdescriptorをUSBとBLEで共有する（`descriptor.rs`）
- USBはVial用に専用のHID interfaceを持つ（poll 1ms、max packet 64）
- BLEではHID over GATTのservice instanceが分かれている。keyboard、composite（mouse / media /
  system）、Vialがそれぞれ別のHID service（`ble_server.rs` / `host_service/vial.rs`）。
  Vial側はinput `2a4d`（notify、report ID 1）とoutput `2a4d`（write、report ID 2）を持つ
- RMKはBLE経由のhost packetを、GATT writeの長さが**ちょうど32 byte**のときだけ受理する
  （`ble/mod.rs`）。それ以外はwarnして捨てる
- ChromiumはmacOSで`IOServiceMatching(kIOHIDDeviceKey)`によりIORegistryを列挙する。
  bus typeは常に`kHIDBusTypeUSB`固定で報告される（`hid_service_mac.cc`、
  `TODO(reillyg): Detect Bluetooth. crbug.com/443335`）。JSからtransportは判別できない
- `physical_device_id`はmacOSでは`kIOHIDLocationIDKey`由来。locationIDを持たないdeviceでは空文字になる
- WebHIDの`HIDDevice`はblink側でdevice info（guid）単位に作られる（`hid.cc`）

### 保護とblocklist

- blockされるのはFIDO usage pageと特定VID / PIDのみ（`hid_blocklist.cc`）。
  Cornix LPのVID / PIDは対象外
- keyboard usage pageやGeneric Desktopのkeyboard / mouse / system controlは
  input / output reportがJSから隠される（`hid_device.cc`の`IsProtectedReportType`）。
  ただし隠されるのはcollection単位であり、`0xFF60`のcollectionは影響を受けない
- macOSでの`IOHIDDeviceOpen`は`kIOHIDOptionsTypeNone`（非排他）で行われる。
  OSがkeyboardとして掴んでいるdeviceでもopenできる

### 権限

- 永続的な権限が保存されるのは`serial_number`と`product_name`がどちらも空でない場合だけ。
  それ以外はephemeralで、切断・browser終了で失われる（`hid_chooser_context.cc`の
  `CanStorePersistentEntry`）
- WebHIDはserial numberをJSへ公開しない。永続化されたかどうかは、
  reload後の`getDevices()`が空かどうかでしか観測できない
- BT HID deviceは、OSがペアリング済みでかつ接続済みのものだけがWebHIDに出る。
  Web BluetoothとWebHIDの権限は連動しない（WICG/webhid #75、Chromium実装者コメント）
- RMKのUSB serial numberは`vial:f64c2b3c;rmk:<version>`形式。
  BLE側はDevice Information Serviceの`2a25`にserial numberを持つが、
  `heapless::String<20>`で切り詰められる

### Spike（実機なしの検証）

`spikes/r-004-webhid-macos/`

- `probe.mjs`はR-003のread flowと同じcommand列を、WebHIDのreport単位で組み立てる。
  write系commandは実装していない
- `self-check.mjs`でR-003のmock device（RMK 0.8.2の応答側）へ`HIDDevice`を装った
  wrapper経由で流し、layer数・tap dance / combo本数・qsid集合が`baseline.vil`と一致し、
  往復数がR-003の実測と同じ168になることを確認した
- したがって実機で失敗した場合、原因がcommandの組み立てではなくtransport側にあると切り分けられる
- `serve.mjs` + `index.html`が実機用のprobe。`http://localhost:8173`はsecure context扱いになる

## Fact（実機測定）

環境: macOS（Darwin 25.5.0）、Chromium系browser、Cornix LP firmware V1.12（左手側をUSB接続）。
生データは`~/Downloads/r-004-usb-*.json` / `r-004-ble-*.json`（コミットしていない）。

### 実機でのdeviceの見え方

- 1台のCornix LPが**3つの`HIDDevice`**として見える。USB・BLEとも同じ3分割
  - `0xFF60` / `0x61`（Vial、in / out 32 byte、report ID 0）
  - `0x01` / `0x06`（keyboard。reportは保護されて空）
  - `0x01` / `0x02` + `0x0C` / `0x01` + `0x01` / `0x80`（mouse / consumer / system control）
- `productName`は`"Cornix"`（USB product string）、VID `0xE118` / PID `0x0001`。
  definitionの`name`（`"HID Keyboard"`）ではない
- `requestDevice`に`0xFF60` / `0x61`のfilterを付ければ1つに絞れる
- **BLE接続時もVial collectionが見える**。macOSはHID over GATTの2つ目以降のservice instanceも
  IOHIDDeviceとして生やしている

### 権限の実測

- reload後の`getDevices()`が3件返った。**権限は永続化される**（ephemeralではない）。
  RMKがUSB serial number（`vial:...`形式）とproduct nameを出しているため、
  `CanStorePersistentEntry`の条件を満たす

### read flowの実測

| transport | 往復 | 総時間 | min    | p50    | p95    | max     |
| --------- | ---- | ------ | ------ | ------ | ------ | ------- |
| USB       | 168  | 340ms  | 1.6ms  | 2.0ms  | 2.8ms  | 3.0ms   |
| BLE       | 168  | 7.03s  | 27.9ms | 43.7ms | 57.5ms | 512.4ms |

- 往復数はUSB / BLEとも168で、R-003のSpike実測と一致した
- **USBとBLEでread結果が全byte一致した**（definition / keymap / encoder / tap dance /
  combo / settings / macro buffer / layout_options、および`steps`のすべて）。
  transportはread結果に影響しない
- BLEの初回1往復は188ms（接続確立ぶんを含む）。以降はp50 43.7ms
- 連続2回のread flowが両方完走した（USB、339ms → 345ms）。
  同一session内でreadを2回行う（write後verify）前提は成立する

### 切断と再接続

- USBを抜くと3つの`HIDDevice`それぞれに`disconnect`が飛ぶ。挿し直すと`connect`が3つ飛ぶ
- **切断前の`HIDDevice`は再利用できない**。`opened`が`true`のままにもかかわらず、
  `sendReport`が解決も拒否もせず**永久にpendingになる**（3秒timeoutで打ち切って観測）。
  再接続後は`getDevices()`から取り直す必要がある
- この挙動はBLEでも同じ。当初BLEで全requestが失敗したのは、切断前のdeviceを掴んでいたためで、
  取り直したうえで再測定したところ完走した

### 実機の状態とfixtureの関係

- 実機のdefinitionは、UF2から取り出した`fixtures/cornix-lp/vial-definition-v1.12.json`と
  **展開後のJSONが完全一致**した。xz圧縮後sizeだけが違う（実機752 byte / fixture 760 byte）。
  圧縮パラメータの差であり、内容は同一
- keymapは`baseline.vil`と1箇所だけ食い違う（layer 3の`(3,2)`が実機`0x00E3`、fixtureは`KC_NO`）。
  tap danceも2件違う。`baseline.vil`はexport時点のsnapshotで、現在の実機状態ではない
- **definitionが宣言していない`(row, col)`に実機が返す値は、実測ではすべて0だった**
  （R-003のmockは非ゼロを返していた。実装がその値を拾わないことに変わりはない）
- encoder 0 layer 0は`0x00AA` / `0x00A9`（`KC_VOLD` / `KC_VOLU`）。
  ユーザーが左のknobで音量が動くことを確認したため、**encoder 0が左手、encoder 1が右手**で確定。
  R-003 / ADR 0002のInferenceが裏付けられた（#3の完了条件）
- settings 9件の値は`baseline.vil`と一致した（integerはLE u16、booleanは1 byte）

## Inference

- USB経由では、Vial用interfaceが独立したIOHIDDeviceになるため、
  `0xFF60` / `0x61`のfilterで一意に選べる可能性が高い。product nameとserial numberが
  USB descriptor由来で埋まるため、権限も永続化される見込み
- BLE経由でVial collectionが見えるかは、macOSのHID over GATT実装が
  **2つ目以降のHID service instanceをIOHIDDeviceとして生やすか**に依存する。
  この挙動はApple側の公開資料に無く、推測で断定できない
- BLEではlocationIDが無いと`physical_device_id`が空になり、
  serial numberの見え方次第で権限がephemeralになりうる
- 168往復は1往復ずつ直列で待つ。BLEのconnection intervalが往復ごとに効くため、
  USBより1桁遅くなる可能性がある。実測で確かめる

## Decision

ADR `docs/decisions/0004-webhid-transport.md`（状態: 採用）に記録した。
deviceは`0xFF60` / `0x61` collectionで選び、transportで分岐しない。`sendReport`は32 byte固定。
切断後はdeviceを取り直し、往復ごとにtimeoutを置く。権限は永続化されるが、
`getDevices()`が空でも異常としない。

## Open Question

Issue #4の完了条件は満たした。残るのは次の点。

- USBとBLEを**同時に**接続した場合に、同じキーボードが6つの`HIDDevice`として見えるかは未確認。
  今回はどちらか一方だけを繋いで測った
- `sendReport`が永久pendingになる条件の切り分けが未了。切断を挟んだ場合に再現することは
  確認したが、それ以外の経路（sleep復帰、BLEのprofile切り替え）は試していない
- BLEのmax 512.4msが何に由来するか未確認（connection interval更新、firmwareのflash read、
  OS側のscheduling）。timeout値の根拠としては3000msで十分に余裕がある
- 往復timeoutを一律3000msとしたが、BLEのp95（57.5ms）とmax（512.4ms）から
  もっと詰められる。UIの応答性を見てR-005以降で決める
- R-003から持ち越し: macro bufferのaction単位への分解（実機のmacro bufferは全byte 0で、
  検証材料が無い。D-002で扱う）
- RMKの`to_via_keycode`が落とすKeyActionの実在は、依然として確認できていない。
  実機で0が返る宣言済み位置は347あり、`baseline.vil`の`KC_NO`と矛盾しないが、
  「firmware内部では別のKeyActionだが0に落ちている」位置がこの中にあるかは、
  readだけでは原理的に判別できない
