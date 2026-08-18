# 2026-08-18 R-004 macOSでUSB / Bluetooth経由のWebHIDを検証する

対象Issue: #4 `[R-004] macOSでUSB / Bluetooth経由のWebHIDを検証する`

**実機検証は未了**。本ログは実機なしで確定できた範囲（protocol / browser実装側の事実）と、
実機で確かめる手順・観測項目までを記録する。transport固有の実測値はOpen Questionに残す。

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

ADR `docs/decisions/0004-webhid-transport.md`（状態: 提案中）に記録した。
deviceは`0xFF60` / `0x61` collectionで選び、transportで分岐しない。
`sendReport`は32 byte固定。Applyは単一の接続session内で閉じ、権限はephemeral前提で組む。
実機確認後に「採用」へ更新するか、BLE部分を差し替える。

## Open Question

すべて実機が要る。手順は`spikes/r-004-webhid-macos/README.md`にある。

- **USBでchooserに出るか / read flowが完走するか**。168往復の総時間とp50 / p95 / max
- **BLEでVial collectionが見えるか**。見えない場合、`filter なし`の列挙で
  macOSがdeviceをどう見せているか（HID serviceがいくつのHIDDeviceになるか）を記録する
- **BLEでread flowが完走するか**。RMKが32 byte以外のwriteを捨てるため、
  macOSがGATT write時にpacketを分割・整形した場合に無反応になりうる
- **切断 / 再接続の挙動**。`disconnect` / `connect` eventが飛ぶか、
  再接続後に同じ`HIDDevice`で`sendReport`が通るか
- **権限が永続化されるか**。reload後の`getDevices()`が空でないか。transportごとに異なりうる
- USBとBLEを同時に接続した場合、同じキーボードが2つの`HIDDevice`として見えるか
- 往復timeoutの妥当値。実測p95が出るまで決められない
- R-003から持ち越し: encoder indexと左右の物理knobの対応（実機でknobを回して確認）
