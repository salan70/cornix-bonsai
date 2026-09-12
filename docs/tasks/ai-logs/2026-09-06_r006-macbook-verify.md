# R-006: MacBook 内蔵キーボードの実機確認（#22）

作業日: 2026-09-06。対象 Issue: #22。親: #20。

作業マシンが検証対象の MacBook 本体だったため、curl での取得は行わず
リポジトリ内の `spikes/r-006-macos-keyboard/verify-on-macbook.sh` を直接実行した。

## スクリプトによる確認結果

### 環境（Fact）

| 項目                                           | 値                     |
| ---------------------------------------------- | ---------------------- |
| macOS                                          | 26.5.2 (Build 25F84)   |
| arch                                           | arm64 (Apple M4)       |
| model                                          | Mac16,13 (MacBook Air) |
| Karabiner-Elements                             | 15.3.0                 |
| DriverKit extension                            | activated enabled      |
| core service (`karabiner_console_user_server`) | 起動中                 |

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

## 手動確認の結果（同日実施）

専用 profile を作成し、Cornix Bonsai の 4 rule を有効化して確認した。

### [1] mod-tap / [4] layer 3 (TG) — 確認 OK

- Caps Lock 単押し → Esc、押しながら他キー → Ctrl（Fact）
- 右 Command 単押しで layer 3 が toggle し、`u/i/o` → `7/8/9`、再度押すと復帰（Fact）
- `to_if_alone` の既定閾値の打鍵感に問題なし

### [2] layer 1 (LT) / [3] layer 2 (MO) — 代替キーで確認 OK

- **Fact: この MacBook は US 配列で、`japanese_kana` / `japanese_eisuu` の物理キーが存在しない。**
  生成された rule そのままでは発火させられない
- 同じ変数（`cornix_layer_1` / `cornix_layer_2`）を操作する代替 rule
  （右 Option = LT1、左 Option = MO2）を追加して確認した。layer 側の manipulator は
  生成された本物の rule をそのまま使用
- LT: 右 Option 押しながら `h/j/k/l` → 矢印、単押し → `to_if_alone` の出力。OK
- MO: 左 Option 押しながら `1/2` → F1/F2、`q` → 無反応（`KC_NO`）。OK
- Inference: 検証できていないのは「かなキーそのものからの発火」だけで、
  機構（`set_variable` + `to_after_key_up` + `to_if_alone`）は実機で成立する

### [5] device スコープ — 確認 OK

- Cornix LP を BLE で接続。grabber の device 一覧では `"product": "Cornix"`
  （keyboard + pointing device の 2 entry、transport: Bluetooth Low Energy）として見え、
  **`is_built_in_keyboard` フラグを持たない**（Fact）
- 内蔵キーボードで layer 3 を ON にした状態で LP 側の `u` を打つと `u` のまま
  （内蔵側は `7`）。**layer 変数は global に立っていても `device_if` が LP を除外する**（Fact）

### [6] atomic 置換 — 確認 OK

外部プロセス（node）から `karabiner.json` を読み、テスト profile 名を変更して
同一ディレクトリの temp ファイルへ書き出し、`rename(2)` で置換した。

- Fact: rename 直後に grabber が `Load .../karabiner.json... core_configuration is updated.`
  を記録し、`karabiner_cli --show-current-profile-name` が外部から書いた新名称を返した
- Fact: Karabiner は書き戻しを行わない。置換 4 分後のディスク上のファイルは
  外部から書いた内容と md5 一致（独自整形での上書きは起きない）
- Fact: reload 後も remap は動作し続ける（Caps Lock → Esc で確認）
- 後始末の復帰書き込み（profile 削除 + selected 変更）も同方式で行い、同様に reload された

## #21 が前提にできること / 追加で判明したこと

- ADR 0022 の Open Question 4 点はすべて解消。#21 は
  `device_if: is_built_in_keyboard` と temp + rename 適用を前提にできる
- `karabiner_cli` に device 一覧オプションは無い（15.3.0）。device の観測が必要なら
  `/Library/Application Support/org.pqrs/tmp/karabiner_grabber_devices.json` を読む
- GUI の rule Enable はクリック順に追加されるため、rule の並びが ADR の
  「高い layer から降順」にならない（今回は layer 0→3 の昇順で追加された。
  from キーが layer 間で重複しない keymap のため挙動への影響は無し）。
  **rule 順序の制御は CLI が profile を所有して書くことでのみ保証できる**
- **US 配列では JIS 固有キーが物理的に存在しない。** desired state（`mac-keyboard.yaml`）の
  from キーは対象マシンの物理配列に依存する。#21 で validation の扱いを検討する

## 後始末（実施済み）

- テスト profile を削除し `Default profile` (selected) へ復帰
- `~/.config/karabiner/assets/complex_modifications/` の cornix asset 2 ファイルを削除
