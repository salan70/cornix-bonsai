# R-004 Spike: macOS + Chromium の WebHID を USB / BLE で検証する

macOS の Chromium 系 browser から Cornix LP へ **read だけ** を行い、transport
(USB / Bluetooth) ごとの device の見え方・権限・所要時間・切断挙動を記録するための
使い捨てコードです。本実装ではありません。判断の結果は
`docs/decisions/0004-webhid-transport.md` にあります。

write 系 command は 1 つも実装していません（AGENTS.md の禁止操作）。

2026-08-18 に USB / BLE の両方で実測済みです（結果は
`docs/tasks/ai-logs/2026-08-18_r-004-webhid-macos.md`）。再測定するときの手順として残しています。

## 実機なしで確認できること

```bash
nix develop -c node spikes/r-004-webhid-macos/self-check.mjs
```

`probe.mjs` が組み立てる command 列を、R-003 の mock device（RMK 0.8.2 の応答側を写したもの）へ
WebHID の `HIDDevice` を装った薄い wrapper 経由で流し、以下を確かめます。

- read フローが例外なく完走する
- layer 数・tap dance / combo 本数・qsid 集合が `fixtures/cornix-lp/baseline.vil` と一致する
- 往復数が R-003 の実測（168 往復）と一致する

つまり実機で失敗した場合、原因が command の組み立てではなく transport 側にあると切り分けられます。

## 実機での手順

```bash
nix develop -c node spikes/r-004-webhid-macos/serve.mjs
# http://localhost:8173 を Chrome / Edge / Brave などで開く（Safari は WebHID 非対応）
```

`file://` では動きません。WebHID は secure context を要求し、`http://localhost` はその扱いになります。

USB と BLE を **別々に** 記録します。BLE は先に macOS の Bluetooth 設定でペアリングしておきます
（browser は OS がペアリング済みの BT HID しか見ません）。

**切断を挟んだら device を取り直す**こと。切断前の `HIDDevice` は `opened` が `true` のまま
`sendReport` が永久に pending になります（実測）。`read` 系のボタンは実行前に `getDevices()` から
取り直しますが、`requestDevice` で選び直した方が確実です。

1. transport を選ぶ（WebHID からは transport を判別できないため、記録用の手入力）
2. `getDevices()` を見る — 権限が残っているか
3. `requestDevice（0xFF60 filter）` — chooser に出るか。出なければ `filter なし` で列挙し、
   OS がその device をどう見せているかを記録する
4. `1 command だけ送る` — 1 往復だけの疎通確認。transport 固有の失敗の切り分けに使う
5. `read フローを実行` — 168 往復の総時間・p50 / p95 / max・timeout の有無
   （実測: USB 340ms / BLE 7.03s）
6. USB を抜く / BLE の電源を切る → `disconnect` event が出るか、再接続で `connect` が出るか
7. page を再読み込みして `getDevices()` — 権限が永続化されているか（実測では 3 件返る）
8. `結果を JSON で保存` — read した生 byte（definition の xz、keymap 全 byte、encoder、
   tap dance / combo / settings / macro buffer）を含む。fixture との突き合わせに使う

### 記録する項目

- device の見え方: `productName` / VID / PID / collection の `usagePage`・`usage`・report 長
- transport ごとの `getDevices()` の件数と、同じ物理 device が何個の `HIDDevice` に見えるか
- 168 往復の総時間と分布、timeout の発生位置
- 切断 / 再接続時の event と、再接続後に `sendReport` が通るか
- reload 後に権限が残るか（残らない場合、Apply フローのたびに chooser が要る）

## 何を検証していないか

- write と unlock。R-005 の範囲
- definition の xz 展開。この Spike は `MATRIX_ROWS` / `MATRIX_COLS` を Cornix LP の
  definition 由来の固定値として持つ（keymap buffer の読み出し長を決めるためだけに使う）
- keycode の意味。値は読むが解釈しない
