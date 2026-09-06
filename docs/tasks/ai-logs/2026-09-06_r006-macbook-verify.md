# R-006: MacBook 内蔵キーボードの実機確認（#22）

作業日: 2026-09-06。対象 Issue: #22。親: #20。

作業マシンが検証対象の MacBook 本体だったため、curl での取得は行わず
リポジトリ内の `spikes/r-006-macos-keyboard/verify-on-macbook.sh` を直接実行した。

## スクリプトによる確認結果

### 環境（Fact）

| 項目 | 値 |
| --- | --- |
| macOS | 26.5.2 (Build 25F84) |
| arch | arm64 (Apple M4) |
| model | Mac16,13 (MacBook Air) |
| Karabiner-Elements | 15.3.0 |
| DriverKit extension | activated enabled |
| core service (`karabiner_console_user_server`) | 起動中 |

### 内蔵キーボードの識別（Open Question 1 の観測）

- Fact: `karabiner_cli` v15.3.0 に `--list-connected-devices` オプションは**存在しない**
  （`--help` の全オプションを確認。device 一覧系は皆無）
- Fact: 代わりに root daemon が書き出す
  `/Library/Application Support/org.pqrs/tmp/karabiner_grabber_devices.json`
  （root 所有・world-readable）で device 一覧を観測できる
- Fact: 内蔵キーボードは `"is_built_in_keyboard": true` として見える。
  観測時点で当該フラグを持つ device は `Apple Internal Keyboard / Trackpad`（keyboard 側）
  の **1 つだけ**。内蔵トラックパッドは `is_built_in_pointing_device: true` で区別され、
  Karabiner の仮想キーボード（VirtualHIDKeyboard 1.8.0）にはどちらのフラグも無い
- Inference: `device_if: [{ is_built_in_keyboard: true }]` は内蔵キーボードだけに
  マッチする見込みが高い。ただし Cornix LP 同時接続時の観測と実挙動の確認は未実施

### asset 生成と lint

- 生成・`--format-json` 整形・`--lint-complex-modifications` すべて成功（lint: ok）
- `self-check.mjs` 全項目成功（埋め込み JSON と生成器出力の一致を含む）
- `--install-asset` で `~/.config/karabiner/assets/complex_modifications/cornix-bonsai-r006.json`
  を配置済み。`karabiner.json` は未変更

## スクリプトの修正（検証で判明した不具合）

1. **モデル判定**: Apple Silicon 世代の `hw.model` は `Mac16,13` 形式で `MacBook*` に
   マッチしない（MacBook Air M4 で実測）。`system_profiler` の Model Name で判定するよう修正
2. **device 一覧**: `--list-connected-devices` が存在しないため、
   `karabiner_grabber_devices.json` を読む方式へ変更。ioreg fallback は維持

## 未実施（人間の操作が必要）

- 手動確認 [1]〜[4]: mod-tap / layer 1 (LT) / layer 2 (MO) / layer 3 (TG) の実挙動
- 手動確認 [5]: Cornix LP 同時接続時に Cornix LP 側で rule が発火しないこと
  （観測時点で Cornix LP は未接続）
- 手動確認 [6]: Karabiner 起動中の `karabiner.json` temp + rename 置換の挙動
- 上記完了後の ADR 0022 Open Question への反映と後始末（専用 profile と asset の削除）
