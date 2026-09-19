# Macの設定を物理配列ごとのファイルへ分け、実行マシンの配列で選ぶ

日付: 2026-09-19 / ADR: 0027 / 先行: ADR 0024（layout宣言）、ADR 0026（deviceスコープ）

## 目的

ANSIのMacBookとJISのMacBookを1つのworkspaceで扱えるようにする。`mac-keyboard.yaml`は
`layout`を1つしか持てず、ADR 0024がそれを「対象マシンの物理配列」と定義していたため、
2台構成が表せなかった。

害は「一部のキーが発火しない」では済まない。`generateCornixProfile`は`keyboard_type_v2`を
`document.layout`から書くので、配列の違うマシンへapplyするとKarabinerの仮想キーボードの型
そのものがずれる。

## 実装

- `src/mac/keyboard-type.ts`（新規） — `detectBuiltInLayout()`。macOS同梱の
  `osascript -l JavaScript` からObjC bridgeでCarbonの`KBGetLayoutType(LMGetKbdType())`を呼ぶ。
  追加依存なし。`src/karabiner/node.ts`と並ぶ2つ目のmacOS境界（前者はOS自身、後者はKarabinerへ訊く）
- `src/workspace/layout.ts` — `macKeymapPath(layout)`を追加。`macKeymap`は`legacyMacKeymap`へ改名
- `src/workspace/mac-keymap-file.ts`（新規） — `readMacKeymapFor(store, layout)`。新しい名前を
  先に見て、無ければ旧名を`layout`宣言で解決する。ファイル名と宣言が食い違えば落とす
- `src/cli/main.ts` — `loadMacKeymap`が`--layout` → 検出 の順で配列を決め、対応する設定を読む。
  検出できず`--layout`も無ければ落とす

## 検出経路の検討（Fact）

3つ調べて1つだけが成立した。

| 経路                                     | 結果                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Carbon `KBGetLayoutType(LMGetKbdType())` | **採用**。FourCharCodeで`'ANSI'`/`'ISO '`/`'JIS '`。手元は`LMGetKbdType=46` → `'ANSI'` |
| `karabiner_grabber_devices.json`         | ANSI / JISを示すfieldが無い（ADR 0024で確認済み）                                      |
| `karabiner.json`の`keyboard_type_v2`     | `generateCornixProfile`が`document.layout`から**書く**値なので循環する                 |
| `ioreg`の`alt_handler_id`                | 同じ番号（46）だが、番号→配列の表を自前で持つ必要があり乖離する                        |

## 実機での end-to-end 確認

このMac（ANSI検出）で確認した。

1. `mac-keyboard.ansi.yaml`が無い → `mac-keyboard.ansi.yaml が見つからない（配列: ansi）`
2. `mac-keyboard.jis.yaml`だけ置く → **黙って使わず**同じエラー
3. `--layout jis` → 読めて diagnostics 0件
4. `mac-keyboard.ansi.yaml`（内蔵 + 外付け`vendor_id: 1452, product_id: 630`）を置く →
   `--layout`なしで検出して読み、生成された`device_if`に両方のidentifiersが入る

4はADR 0026とADR 0027が噛み合っていることの確認でもある。

## testを実行マシンから切り離した

`src/cli/mac.test.ts`の全mac実行へ`--layout jis`を明示した。検出結果に依存させると、
CIのmacOS runnerで手元と違う配列が返って落ちる。`src/mac/keyboard-type.test.ts`も
実行マシンの配列を期待値に書かず、「落ちない」「扱える値かundefinedしか返さない」だけを固定する。

302件パス（追加5件: 旧名の解決、ファイル名と宣言の食い違い、未対応の`--layout`、検出の2件）。

## 中間状態

**Browser UIはまだ旧名の1ファイルだけを読み書きする。** 配列を選ぶ導線が無いため。
`WORKSPACE_LAYOUT.legacyMacKeymap`という名前にして、移行が必要な箇所が呼び出し側から
見えるようにしてある。UIへ配列の選択を入れるときに`macKeymapPath(layout)`へ移す。

## 次

`cornix mac devices`（Karabinerの観測一覧から選んで`devices`へ記録）。
