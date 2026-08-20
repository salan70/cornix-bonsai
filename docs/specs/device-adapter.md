# Device I/O adapter

WebHID固有の型はadapterに閉じ、Coreとprotocolのテストは`HidDeviceLike`だけに依存する。
対象はVial collection（usagePage `0xFF60`, usage `0x61`）、report ID `0x00`、32 byte report。
各request/response往復には既定3000ms timeoutを適用し、disconnect後に古いdevice handleを
再利用しない。

<!-- @code src/device/protocol.ts#VialSession -->

## Report session

送信前にinputreportの待ち受けを用意し、`sendReport`またはinputreportのどちらかがtimeoutに
なれば失敗する。ackはwrite成功の証明にせず、write後の同じentryの再read値だけをverifyへ渡す。

<!-- @code src/device/protocol.ts#readVialDevice -->

## Full read

definitionとmatrix/encoderを実機から取得し、layer・macro・tap dance・combo・settings・
keymap・encoderを`VilDocument`へ再構築する。matrixの物理キー集合はdefinitionから導出し、
宣言されていない位置は`-1`として保持する。容量はfixtureやworkspaceから推測しない。
Cornix LP V1.12のkey override / alt repeat keyは0件である。非ゼロ件数を返すfirmwareは、
未対応状態を空配列へ落とさずprotocol errorでfull readを中断する。

`layout_options`はdefinitionが`layouts.labels`を宣言している場合だけreadする（R-003）。
`gatesKeys`（選択肢で出し分けられるキーの有無）を条件にすると、labelsだけを持つ
Cornix LPで実機値をreadせず`-1`になり、baselineの`0`と偽の差分になる。

<!-- @code src/device/protocol.ts#encodeWriteCommand -->
<!-- @code src/device/protocol.ts#writeAndVerify -->

## Single-entry write

公開するwriteはkey、encoder、tap dance、combo、settingの5種類だけで、bulk buffer、macro
buffer、reset、bootloaderのcommandは組み立てない。`write → 同一entry read → wire値比較`を
1件単位で繰り返し、不一致・timeout・disconnectで直ちに中断する。

<!-- @code src/device/webhid.ts#WebHidAdapter -->

## Browser adapter

`getDevices()`からの再取得と明示的chooserを分ける。permission済みdeviceが空でもchooserを
常に表示でき、USB/BLEの区別はUIへ出さない。

request中でない切断は`navigator.hid`のdisconnect eventでしか届かないため、connectionが
これを購読して上位へ通知する。通知を受けた側はdevice由来のstate（current state、
Apply計画）をまとめて捨て、再接続後はfull readからやり直す。
