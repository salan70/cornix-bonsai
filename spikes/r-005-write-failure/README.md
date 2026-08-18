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

1. 全 read して backup を JSON で保存する（唯一の復元元）
2. 書き換える 1 箇所を決めて現在値を読む。既定は layer 9 の `(0,0)`
   （definition が宣言済みで、`baseline.vil` では `KC_NO` の位置）
3. write を 1 回だけ送る
4. 直後に同じ位置を読み直す
5. ケーブルを抜いて挿し直し、もう一度読む（flash に載ったかどうかがここで分かる）
6. 連続 write の最中にケーブルを抜き、再接続して部分状態を見る
7. backup の値へ書き戻し、全 read して backup と突き合わせる

生データは `~/Downloads/r-005-*.json` へ落ちる。コミットしない。

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
