# R-005 Spike: 実機 write が失敗したときの状態と復旧

Vial の差分 write が中断・部分成功したときに Cornix LP がどの状態になり、Cornix Bonsai が
何を根拠に復旧できるかを確かめる。**使い捨てコードです。本実装ではありません。**
判断の結果は `docs/decisions/0005-write-failure-recovery.md` にあります。

Cornix LP の firmware は RMK であり vial-qmk ではない。write の挙動は RMK 側の実装が決めるため、
参照した一次情報はすべて tag `rmk-v0.8.2` の以下のファイル。

- `rmk/src/host/via/mod.rs` — VIA の write command
- `rmk/src/host/via/vial.rs` — Vial の write command
- `rmk/src/host/via/vial_lock.rs` — unlock 状態
- `rmk/src/storage/mod.rs` / `rmk/src/host/storage.rs` — flash への書き込みと起動時の復元
- `rmk/src/channel.rs` — `FLASH_CHANNEL`（容量は `rmk-config` の `flash_channel_size` = 4）

host 側の期待挙動は vial-gui v0.7.1 の `src/main/python/protocol/keyboard_comm.py`
（`set_key` / `set_encoder` / `restore_layout`）と `src/main/python/util.py`（`hid_send`）を参照した。

## 実行

offline（実機不要）。失敗モードの表が出る。

```bash
nix develop -c node spikes/r-005-write-failure/self-check.mjs
```

実機（**ユーザーが操作する**。AI は write ボタンを押さない）。

```bash
nix develop -c node spikes/r-005-write-failure/serve.mjs
# http://localhost:8175 を Chromium 系 browser で開く
```

## 構成

| file                   | 役割                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `mock-persistence.mjs` | R-003 の mock に write と RAM / flash の分離、故障注入を足した device       |
| `write-probe.mjs`      | 差分 write の command 組み立てと、1 件ずつ write → 再 read する `applyDiff` |
| `self-check.mjs`       | 故障シナリオを並べ、再 read で検出できる / できない失敗を表にする           |
| `serve.mjs`            | 実機 probe 用の静的 server（公開 root は `spikes/`）                        |
| `index.html`           | 実機 probe。手順 1〜7 のボタンを人間が押す                                  |

R-003 の `mock-device.mjs` と R-004 の `probe.mjs` はコピーせず import している。
R-004 の `probe.mjs` は `VialSession` を `export` するようにだけ変更した（挙動は変えていない）。

## mock が写している RMK の構造

1. via task は「RAM 上の keymap を更新」→「`FLASH_CHANNEL` へ送る」→「応答を返す」の順で動く
2. flash への書き込みは別の storage task が非同期に行い、失敗しても `error!` を出すだけで host へは返らない
3. したがって **ack も write 後の再 read も、flash に載ったことを意味しない**

`reboot()` は RAM を捨てて flash から作り直す。実機で電源を入れ直したときに何が残るかを、
再 read では観測できない側から確認するために置いている。

## 実機手順（index.html）

write 系のボタンは、手順 1 の backup を保存するまで押せない。

0. device を選び、unlock 状態と uptime を読む（uptime は手順 5 の基準値になる）
1. 全 read して backup を JSON で保存する（唯一の復元元）
2. 書き換える 1 箇所を決めて現在値を読む。既定は layer 9 の `(0,0)`
   （definition が宣言済みで、`baseline.vil` では `KC_NO` の位置）
3. write を 1 回だけ送る
4. 直後に同じ位置を読み直す
5. **電源を切って**入れ直し、もう一度読む（flash に載ったかどうかがここで分かる）
6. 連続 write の最中に切断し、再接続して部分状態を見る
7. backup の値へ書き戻し、全 read して backup と突き合わせる

### 手順 5 の注意

Cornix LP は battery を積んでいるため、**USB ケーブルを抜いても電源が落ちるとは限らない**。
RAM が生き残っていると、flash に載っていない値をそのまま読んで「永続化された」と誤読する。
電源スイッチを切る（または battery を外す）こと。

落ちたかどうかは uptime（`0x02 0x01`、RMK の `Instant::now().as_millis()`）で確認する。
巻き戻っていなければ再起動していないので、その回の結果は根拠にならない。

### transport について

USB でも BLE でも protocol は同じで、read 結果は全 byte 一致する（R-004 実測）。
BLE で検証しても構わない。差は往復 latency（p50 43.7ms / USB は 2.0ms）で、
全 read が 7 秒ほどかかる。切断の作り方だけが変わる。

- USB: ケーブルを抜くと切断されるが、battery があれば電源は落ちない
- BLE: 電源を切れば切断と電源断が同時に起きる。BLE 接続だけを切ると電源は落ちない

つまり手順 6（切断だけ）と手順 5（電源断）を分けて起こせるのは USB 接続時になる。
BLE で両方を見るなら、手順 6 は browser 側から接続を切る（`forget()` ではなく OS の
Bluetooth 設定で切断する）か、通信範囲外へ持ち出す。

生データは `~/Downloads/r-005-*.json` へ落ちる。コミットしない。

## 動かないときに見るところ

ボタンを押しても何も起こらない場合、module 自体が読み込まれていない可能性が高い。
その場合は画面の log に `[boot] module が読み込まれていない` が出る。順に確認する。

1. `serve.mjs` を起動しているか。ポートは **8175**（R-004 の 8173 ではない）
2. `http://localhost:8175` を開いているか。`file://` では `navigator.hid` が
   undefined になり、WebHID は一切使えない
3. Chromium 系 browser か。Safari / Firefox は WebHID を持たない
4. browser の console に出ているエラー。import に失敗していれば URL が出る

`[boot] module 読み込み完了` が出ていれば全ボタンが登録されている。
その状態で反応が無い場合は log と status 行に理由が出る。

## 検証していないこと

- `EepromReset`(`0x0A`) と `BootloaderJump`(`0x0B`)。mock でのみ扱い、実機へは送らない
  （AGENTS.md の禁止操作）
- `DynamicKeymapSetBuffer`(`0x13`) の実機での挙動。mock 上では 32 byte を超えて読みにいく経路が
  あることまで確認したが、実機で firmware を落とすことは試さない
- unlock の実行。`GetUnlockStatus` を読むだけで、unlock key の長押しは行わない
- macro の write。RMK の macro 実装が途中（`0x0C` は 32 固定、`0x0F` は buffer 全体を flush）で、
  比較材料が無い（D-002 で扱う）
- flash の摩耗と `sequential-storage` の GC。実機で storage を埋める試験は行わない
- 往復 timeout の詰め直し。UI 応答性に依存するため D-005 で決める
