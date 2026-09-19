# 適用先キーボードを一覧して登録する cornix mac devices

日付: 2026-09-19 / ADR: 0026（deviceスコープ）、0027（配列ごとのファイル）

## 目的

ADR 0026で`devices`へ外付けキーボードを書けるようになったが、vendor / product idを
利用者が知る手段が無かった。`karabiner_grabber_devices.json`はroot所有かつworkspace外で、
Browser UIからは読めない。CLIが一覧を出し、選んだidentifiersを設定ファイルへ記録する。

## 対話にしない

`mac apply`と同じ形にした。`--add`が無ければ観測されたキーボードを出して終わり、
**見てから明示的に指定したときだけ**書き込む。CLIはstdoutへJSONを出すだけという既存の
形を保てて、testも書ける。

## 実装

- `src/core/mac-keymap/edit.ts` — `addMacDevice(document, device)`。copy-on-writeの純関数。
  既にあるデバイスは足さない。順序は追加順のまま（`device_if`のidentifiersはORで意味は
  順序に依存しないが、並べ替えるとdiffが動く）
- `src/karabiner/node.ts` — `readObservedKeyboards(path?)`。pointing deviceと
  **Karabiner自身の仮想キーボード**（`is_virtual_device`）を外す。仮想キーボードは
  Karabinerの出力側で、登録すると自分の出力を食う
- `src/cli/main.ts` — `mac devices` サブコマンド。`--devices <path>`で観測ファイルの場所を
  指せる（`--karabiner`と同じ形）
- `fixtures/mac-keyboard/karabiner-devices.json` — 実機の構造をそのまま写したfixture。
  内蔵・pointing device・仮想キーボード・外付けの4件で、絞り込みを検証できる

## 実機での確認

- 一覧: 内蔵キーボード1件だけが出る。pointing deviceとKarabinerの仮想キーボードは外れる
- `--add 1452:630`: `devices`へ足されて書き戻る。YAMLは
  `- { vendor_id: 1452, product_id: 630 }` を2スペース字下げした1行
- 二重の`--add`: ファイルが変わらない
- `--add abc`: `--add は <vendor_id>:<product_id> の形（abc が渡された）` で落ちる

310件パス（追加5件）。

## 安全側の注意

**Cornix LP自身も一覧に並ぶ。** 登録するとMacのkeymapがCornix LPのfirmware keymapと
二重に効く。ADR 0022がdeviceスコープを置いた隔離が壊れる。CLIは`product`と
`manufacturer`を出して判断材料にするが、機械的な除外はしていない。mac系サブコマンドは
`keymap.yaml`もdefinitionも読まない設計（ADR 0022）なので、Cornix LPのidを知る経路が無い。
利用者ガイドに注意を書いた。

## 次

Browser UI（案Aの配置、状態の分離、status barの分離、picker語彙の絞り込み）。
