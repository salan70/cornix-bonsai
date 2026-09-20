# R-007 Spike: Caps Lock の modifier mapping と Karabiner の前後関係を確かめる

dotfiles が `com.apple.keyboard.modifiermapping.0-0-0` で Caps Lock → 右 Control を
**全キーボード対象**でかけている（`home/modules/macos-defaults.nix`）。
この状態で Karabiner の `from` に届くのが `caps_lock` なのか `right_control` なのかを実測する。

決まるまで `mac-keyboard.*.yaml` へ `caps_lock` を書かない（ADR 0028）。
書いた側が間違っていた場合、規則は黙って発火しない。`position-not-on-layout` は
物理配列に無い位置しか見ないので、この種の死に規則を捕まえられない。

## なぜ実測が要るか

macOS の HID modifier remapping と Karabiner の `IOHIDDeviceOpen(..., kIOHIDOptionsTypeSeizeDevice)`
のどちらが先に効くかは、公開ドキュメントで確認できない。推測で設計を固定しない
（AGENTS.md の設計ルール）。

## 観測する項目

dotfiles の mapping（Src 30064771129 = Caps Lock / Dst 30064771300 = 右 Control）が
**有効なまま**で確かめる。

1. probe profile に `from: caps_lock → KC_F18` と `from: right_control → KC_F19` の
   2 規則を入れ、内蔵キーボードの物理 Caps Lock を押す。どちらが発火するか
2. Karabiner-EventViewer の pre / post 両方のペインで、同じ打鍵の生 usage を見る
3. probe profile を選択したまま、内蔵キーボードの Ctrl+p / b / f / n が生きているか
4. Cornix LP の Caps タップ（`KC_CAPSLOCK` 送出）が影響を受けるか。
   `device_if` で除外されるはずだが確認する
5. 物理の右 Control を持つキーボードで、remap された Caps と区別が付くか

## 結末ごとの帰結

| 観測                                      | 帰結                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Karabiner が `caps_lock` を見る           | yaml は `caps_lock` を束ねる。dotfiles の `defaults` は内蔵キーボードに対しては冗長になるが、Cornix LP のために残る |
| Karabiner が `right_control` を見る       | yaml は `right_control` を束ねる。`caps_lock` を書くと無診断の死に規則になる                                        |
| seize したデバイスだけ mapping を迂回する | 2 台で挙動が割れる。dotfiles の write は据え置き、yaml はデバイスごとに書き分ける                                   |

## 手順

```sh
sh spikes/r-007-capslock-modifiermapping/verify-capslock.sh
```

Karabiner engine は実物の `~/.config/karabiner/karabiner.json` しか読まないため、
このスクリプトは**そのファイルを一時的に書き換える**。開始時に backup を取り、
終了時（中断時も）に復元する。

結果は Fact / Inference / Decision / Open Question を分けて
`docs/tasks/ai-logs/YYYY-MM-DD_capslock-modifiermapping.md` へ記録する。
