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

| ファイル               | 役割                                                      |
| ---------------------- | --------------------------------------------------------- |
| `desired.mjs`          | 検証用の最小の desired state。単一の定義元                |
| `generate.mjs`         | desired state → Karabiner rules の生成器プロトタイプ      |
| `self-check.mjs`       | 上記 1〜5 の検証                                          |
| `verify-on-macbook.sh` | 開発環境の無い MacBook で実機確認するための単体スクリプト |

`generate.mjs` の QMK → Karabiner key_code 表は網羅表ではありません。Spike に必要な範囲だけです。

`verify-on-macbook.sh` は生成器を呼べないため生成物を直接埋め込んでいます。
**埋め込みが生成器の出力とずれていないことは `self-check.mjs` が検査します。**
`generate.mjs` か `desired.mjs` を変えたら、スクリプトの `CORNIX_ASSET_JSON` heredoc も
更新してください。self-check が落ちて気づけます。

## MacBook 実機でしか確認できないこと

このマシン（Mac mini）には内蔵キーボードが無いため、以下は未確認です。ADR 0022 の
Open Question に記録してあります。

1. `device_if` の `is_built_in_keyboard: true` が MacBook 内蔵キーボードだけにマッチすること
2. 同時接続した Cornix LP に一切影響しないこと
3. layer（`set_variable` + `variable_if`）と tap-hold（`to_if_alone`）の実挙動
4. Karabiner 起動中に外部から `karabiner.json` を temp + rename で置換したときの競合挙動

### 実機での手順

対象の MacBook に開発環境が無くても実行できるよう、`verify-on-macbook.sh` を用意してあります。
**macOS 標準のコマンドしか使いません。** Node も pnpm も Nix も Xcode Command Line Tools も要りません。

```bash
curl -fsSL https://raw.githubusercontent.com/salan70/cornix-bonsai/main/spikes/r-006-macos-keyboard/verify-on-macbook.sh -o verify.sh
less verify.sh
sh verify.sh
```

**`curl | sh` で直接パイプせず、落として中身を読んでから実行してください。**

既定では読み取りと一時ディレクトリへの書き出しだけを行います。
`--install-asset` を付けたときに限り、Karabiner の import 用ライブラリへ 1 ファイル置きます。
**`~/.config/karabiner/karabiner.json` は決して変更しません。**

スクリプトが行うこと:

1. macOS のバージョンと arch から、必要な Karabiner の系列を判定する
   （13 以降は 15.x、11〜12 は v14.13.0、10.15 は v13.7.0）
2. Karabiner の導入状態、DriverKit extension の有効性、core service の起動を確認する
3. karabiner_grabber の device 一覧
   （`/Library/Application Support/org.pqrs/tmp/karabiner_grabber_devices.json`）で
   `is_built_in_keyboard` を実際に観測する（読めない場合は `ioreg` で代替表示する）。
   `karabiner_cli` に device 一覧のオプションは無い（v15.3.0 で実測）
4. asset を書き出し、`--format-json` で整形して `--lint-complex-modifications` に通す
5. 人間が行う確認手順を出力する

layer・tap-hold・device スコープの確認は人間の操作が要ります。スクリプトは手順を出すだけです。
**確認前に専用 profile を作ってください。** 現在の profile へ直接入れると普段の設定と混ざります。

### Intel Mac について

Karabiner は Intel / Apple Silicon の両方を対象にしているため、Intel Mac であること自体は
障壁になりません。効いてくるのは **macOS のバージョン**だけです。
macOS 12 以前では Karabiner 15.x を使えず、kext 方式の古い系列になります。
スクリプトがバージョンを判定して必要な版を表示します。
