# R-006 Spike: MacBook 内蔵キーボードを Karabiner 経由で管理できるか検証する

QMK 表記の desired state から Karabiner-Elements の complex modifications を組み立て、
**layer（MO / LT / TG）と tap-hold が表現できること**、**落とせない keycode を黙って
捨てないこと**、**生成物が Karabiner の lint を通ること**を確かめる使い捨てコードです。
本実装ではありません。判断の結果は `docs/decisions/0022-macos-keyboard-management.md` にあります。

実機への write は 1 行もありません。生成物は一時ディレクトリへ書き、
`~/.config/karabiner/karabiner.json` には触れません。

## なぜ Karabiner に寄せるのか

Apple 製キーボードは firmware の keymap を持たないため、Cornix LP と同じ経路
（Vial / WebHID）が 1 つも使えません。remap は macOS host 層でしか行えず、選択肢は
`hidutil`（1:1 の usage remap のみ、layer 不可）か Karabiner か自作の 3 つです。
自作は DriverKit の仮想 HID device と root daemon が要り、`com.apple.developer.driverkit.transport.hid`
は Apple の個別承認制です。CGEventTap による軽量版は入力元デバイスを公開 API で識別できず、
「内蔵キーボードだけ」という要件を満たせません。詳細は ADR 0022 にあります。

## 実機なしで確認できること

```bash
nix develop -c node spikes/r-006-macos-keyboard/self-check.mjs
```

MacBook は要りません。Karabiner-Elements のインストールだけが前提で、
**core service が起動していなくても動きます**（`karabiner_cli --lint-complex-modifications` は
core service に接続しないため）。

確かめる内容:

1. `MO(n)` / `LT n(kc)` / `TG(n)` / mod-tap が manipulator へ落ちる
2. `KC_TRNS` と「layer 0 と同値のキー」は manipulator を出さない
   （Karabiner は書かれていないキーを素通しするので、出さないことが正しい挙動になる）
3. `TD(0)` のような落とせない keycode が diagnostic になり、黙って消えない
4. 生成物が `karabiner_cli --lint-complex-modifications` を通る
5. `karabiner_cli --format-json` の整形が `JSON.stringify` と一致しない

5 が重要です。Karabiner は独自の整形（4 space インデント、1 行に収まる object は 1 行）で
JSON を書き戻すため、**Apply の diff と verify をテキスト比較で行えません**。
所有 profile の構造で比較する必要があります。

## ファイル

| ファイル         | 役割                                                 |
| ---------------- | ---------------------------------------------------- |
| `generate.mjs`   | desired state → Karabiner rules の生成器プロトタイプ |
| `self-check.mjs` | 上記 1〜5 の検証と、最小の desired state             |

`generate.mjs` の QMK → Karabiner key_code 表は網羅表ではありません。Spike に必要な範囲だけです。

## MacBook 実機でしか確認できないこと

このマシン（Mac mini）には内蔵キーボードが無いため、以下は未確認です。ADR 0022 の
Open Question に記録してあります。

1. `device_if` の `is_built_in_keyboard: true` が MacBook 内蔵キーボードだけにマッチすること
2. 同時接続した Cornix LP に一切影響しないこと
3. layer（`set_variable` + `variable_if`）と tap-hold（`to_if_alone`）の実挙動
4. Karabiner 起動中に外部から `karabiner.json` を temp + rename で置換したときの競合挙動

### 実機での手順

```bash
nix develop -c node spikes/r-006-macos-keyboard/self-check.mjs
```

を MacBook 上で実行したあと、生成された asset を Karabiner-Elements の
Settings → Complex Modifications から手動で読み込みます。**この Spike は
`karabiner.json` を書き換えません。** 読み込みと profile の選択は人間が行ってください。

Cornix LP を USB か BLE で同時に接続し、内蔵キーボードでのみ layer と tap-hold が
効くことを確認します。
