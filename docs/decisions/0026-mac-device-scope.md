# Macの設定は適用先deviceを宣言し、内蔵キーボード固定をやめる

状態: 採用

2026-09-19に、ADR 0022が`device_if`を`is_built_in_keyboard`固定にしていた判断を見直した。
物理配列ごとのファイル分割（別ADR）と、内蔵配列の自動判定（別ADR）は本ADRの対象外。

## 背景

利用者は3枚のApple製キーボードを使う。

- 手元のMacBookは**ANSI**（Carbonの`KBGetLayoutType(LMGetKbdType())`が`'ANSI'`、
  `LMGetKbdType=46`。Karabinerの`Default profile`も`keyboard_type_v2: "ansi"`。2026-09-19に実測）
- もう1台のMacBookが**JIS**
- 外付けのApple純正**US**キーボードがあり、内蔵USと同じ設定を使いたい

`generateKarabinerRules`は全manipulatorへ`{ type: "device_if", identifiers:
[{ is_built_in_keyboard: true }] }`を付けていた。外付けキーボードには**1件も適用されない**。
`mac-keyboard.yaml`には適用先を書く場所が無く、固定値を書き換える以外に選択肢が無い。

Karabinerの`device_if`は`identifiers`が配列でORとして評価される。内蔵キーボードは
vendor / product idを申告せず`is_built_in_keyboard`でしか指せないが、外付けは
vendor / product idで指せる（`karabiner_grabber_devices.json`で実測）。

## 選択肢

1. 適用先deviceを`mac-keyboard.yaml`が宣言し、`device_if`をそこから組む
2. `is_built_in_keyboard`条件を外し、全キーボードへ適用する
3. 外付け用の設定ファイルを別に持つ

## 決定

案1を採る。あわせて以下を決めた。

- **`MacKeymapDocument`へ`devices`を必須フィールドとして追加する**。YAMLでは省略可とし、
  `parseMacKeymapYaml`が省略時に`DEFAULT_MAC_DEVICES`（内蔵だけ）を埋める。`layout`と同じ形で、
  既存の`mac-keyboard.yaml`の意味を変えない
- **`MacDeviceIdentifier`はKarabinerの語彙をそのまま写す**。`{ builtIn: true }`と
  `{ vendorId, productId }`の2形だけを持ち、Karabiner形への写像は`generate.ts`の
  `deviceCondition`だけが持つ
- **`serializeMacKeymapYaml`は`devices`を常に書き出す**。正規形は明示（ADR 0024と同じ）。
  各項目は1行のflow mappingで置き、block mappingへは展開しない。parserが受けるのも
  この2形だけとする
- **`devices`が空なら`mac-keymap/no-target-device`（error）**。`device_if`のidentifiersが
  空だとどのmanipulatorもマッチせず、書いた割り当てが1件残らず効かない。ADR 0010の
  「機能そのものが無くなる」に当たる
- **設定の単位は「内蔵キーボード」ではなく物理配列**とする。同じ配列の内蔵と外付けは
  同じ設定を共有し、どのデバイスへ効かせるかはKarabinerの`device_if`がランタイムで振り分ける

## 理由

- **案2は事故になる**。Cornix LP自身もキーボードとして列挙される。条件を外すとMacのkeymapが
  Cornix LPのfirmware keymapと二重に効く。ADR 0022が`is_built_in_keyboard`を置いたのは
  この隔離のためで、その目的は今も正しい。変えるべきは「内蔵**固定**」であって条件そのものではない
- **案3は同じ割り当てを二重管理させる**。外付けUSと内蔵USで使いたい設定は同一で、
  分けても内容が重複するだけ。`identifiers`がORで複数デバイスを指せる以上、分ける理由が無い
- **写像を1か所に閉じる**のはADR 0025の「判定をUI側へ複製すると必ず乖離する」と同じ理由。
  内部表現をKarabinerの生のsnake_caseにしない代わり、写像は3行に留めて定義元を1つにする
- **省略時の既定を内蔵だけにする**のは、既存ファイルの意味を変えないため。schemaは
  `cornix-bonsai/mac-keymap@1`のまま上げない（省略時の挙動追加は互換性を壊さない）

## 影響

- ADR 0022の「device スコープは内蔵キーボードに固定」は本ADRで置き換わる。隔離の目的は維持する
- 外付けデバイスのvendor / product idを利用者が知る手段が要る。`karabiner_grabber_devices.json`は
  root所有かつworkspace外なので、Browser UIからは読めない。CLIが観測一覧から選ばせて
  `devices`へ記録する経路を別途用意する
- `fixtures/mac-keyboard/desired.yaml`は正規形に合わせて`devices`を明示した。
  `karabiner-baseline.json`は内蔵だけの設定なので生成結果が変わらず、更新不要

## Open Question

- **外付けキーボードの物理配列データが無い**。`macPhysicalLayout`が持つのはMacBook内蔵の
  盤面だけで、外付けのキー集合は分からない。`mac-keymap/position-not-on-layout`は内蔵の
  盤面を前提にした診断なので、外付けを含む設定でどう扱うかは未決。現状は`layout`宣言の
  盤面で判定し続けている
- **外付けキーボードの物理配列を検証できない**。`devices`にUS配列でないキーボードを
  登録しても、`layout: ansi`との矛盾を検出する手段が無い。登録経路を作るときに扱う
