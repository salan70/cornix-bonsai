# Macの設定は物理配列ごとのファイルで持ち、CLIは実行マシンの配列で対象を選ぶ

状態: 採用

2026-09-19に、ADR 0024の「`layout`は対象マシンの物理配列の宣言」という前提が、
配列の違うMacを2台使う構成で成立しないことへの対応を決めた。

## 背景

利用者はANSIのMacBookとJISのMacBookを併用する。`mac-keyboard.yaml`は`layout`を1つしか
持てず、ADR 0024はそれを「対象マシンの物理配列」と定義しているため、2台を1つの
workspaceで扱えない。

害は「一部のキーが発火しない」では済まない。`generateCornixProfile`は
`virtual_hid_keyboard.keyboard_type_v2`を`document.layout`から書く（ADR 0024）。
`layout: jis`のままANSI機へapplyすると、Karabinerの仮想キーボードの型そのものが
`jis`になり、記号の対応が全体的にずれる。

利用者の要望は「配列ごとに設定を編集したり保持したい」で、共通の割り当てを1つ持って
片方で劣化させる形ではない。

## 選択肢

1. 物理配列ごとに別ファイルで持ち、CLIが実行マシンの配列で対象を選ぶ
2. 1ファイルに配列ごとのセクションを持つ（schemaを`@2`へ上げる）
3. `layout`を「編集時に描く盤面」の意味へ変え、`keyboard_type_v2`と位置チェックを
   apply時の検出値から取る（1ファイルを両方のMacで共有）

## 決定

案1を採る。あわせて以下を決めた。

- **`mac-keyboard.<layout>.yaml`**（`macKeymapPath`）を正の名前とする。ファイル名と中の
  `layout`宣言が食い違っていたら読み込み側が落とす。正規形が2つあると、どちらが正か
  分からないまま生成まで進む
- **旧名`mac-keyboard.yaml`は読み込み時の後方互換として残す**。どの配列のものかは中の
  `layout`宣言で決まる。宣言が求めた配列と違えば「その配列の設定は無い」として扱う
- **どの設定を使うかは宣言ではなく実行しているマシンが決める**。`cornix mac` は
  `detectBuiltInLayout()`で内蔵キーボードの物理配列を検出し、対応するファイルを読む
- **検出はCarbonの`KBGetLayoutType(LMGetKbdType())`**。macOS同梱の`osascript -l JavaScript`
  からObjC bridgeで呼ぶ。追加依存を持ち込まない。FourCharCodeで`'ANSI'` / `'ISO '` / `'JIS '`
  を返す（2026-09-19に実測。手元のMacBookは`LMGetKbdType=46` → `'ANSI'`）
- **検出できなければ`--layout ansi|jis`の明示指定を要求して落とす**。黙って既定の配列へ
  倒すと、別配列のマシンへ間違った`keyboard_type_v2`を書き込む
- **applyするのは検出した配列のファイル1つだけ**。他の配列のファイルは読まない

## 理由

- **案2はschema上げと全経路の改修を伴う**。`parse` / `serialize` / `validate` / `generate` /
  `edit` / `apply` とそのtestすべてに波及する。案1なら各ファイルが今の`@1`形式のままで、
  既存のCore実装が無変更で通る。UIの整理が主目的の局面で、Coreの血管を張り替える理由が無い
- **案3は利用者の要望と違う**。「配列ごとに保持したい」のであって、共有した1つを
  片方で劣化させたいのではない
- **検出経路は3つ検討して1つだけが成立した**
  - `karabiner_grabber_devices.json`にはANSI / JISを示すfieldが無い（ADR 0024で確認済み）
  - `karabiner.json`の`keyboard_type_v2`は`generateCornixProfile`が`document.layout`から
    **書く**値なので循環する
  - `ioreg`の`alt_handler_id`は同じ番号（46）を返すが、番号から配列への表を自前で持つ
    必要があり、世代ごとの値が不明で乖離する
- **検出を必須にせず`--layout`を残す**のは、macOS以外や検出失敗でCLIを使えなくしないため。
  検出は「既定を決めるための追加情報」であって、無いと何もできない前提にはしない

## 影響

- ADR 0024の「`layout`は対象マシンの物理配列の宣言」は、「**そのファイルが対象にする**
  物理配列の宣言」へ意味が狭まる。どのマシンで使うかはファイル名と検出が決める
- Browser UIはまだ配列を選ぶ導線を持たないため、旧名の1ファイルだけを読み書きする
  状態が続く。`WORKSPACE_LAYOUT.legacyMacKeymap`という名前で、移行が必要な箇所が
  呼び出し側から見えるようにしてある
- `src/mac/keyboard-type.ts`が`src/karabiner/node.ts`と並ぶ2つ目のmacOS境界になる。
  前者はOS自身へ、後者はKarabinerへ訊く
- CLIのtestは`--layout`を明示して実行マシンの配列に依存させない。CIのmacOS runnerで
  検出結果が手元と違っても落ちない

## Open Question

- **外付けキーボードは検出した配列のファイルからしか適用されない**。JIS機へ外付けの
  USキーボードを挿した場合、ANSI設定の外付けスコープは適用されない。一般には
  「検出した配列のファイルは全スコープ、他の配列のファイルは非内蔵スコープだけ」が
  正しいが、現時点で必要な構成ではないため実装しない
- 両方の配列のファイルが同じ profile 名を持つため、1台のMacで両方を同時に
  `karabiner.json`へ入れることはできない。上の一般化を実装するときに扱う

## 追記（2026-09-19 UI）

Browser UI は編集対象ドロップダウンで配列を選ぶ。
`mac-keyboard.<layout>.yaml` を読み書きする。
内蔵配列の検出は CLI だけが行う。
