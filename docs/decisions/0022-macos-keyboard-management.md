# MacBook内蔵キーボードはKarabinerをengineとし、Cornix Bonsaiはdesired stateとgeneratorに徹する

状態: 採用

2026-08-30に、macOSのremap機構を洗い出し、Spike（`spikes/r-006-macos-keyboard/`）で
QMK表記からKarabiner rulesを生成できることを確認して決めた。

## 背景

Cornix LP向けに完成したMVPへ「MacBook内蔵キーボードも同じツールで管理したい」という
要求が来た。要件はlayer（`MO` / `LT` / `TG`）とtap-holdで、combo は対象外である。

調査の結果、これは**device adapterの追加ではなく別のdevice classの追加**だと分かった。
既存ADRが積み上げた前提が1つも成立しない。

- Apple製キーボードはVial / VIA protocolを持たず、firmwareのkeymapを書き換えられない。
  ADR 0004が引用済みのChromium `IsProtectedReportType`がkeyboard collectionのreportを隠すため、
  WebHIDからも触れない
- `VilDocument`（ADR 0001 / 0006）に相当するraw層が存在しない
- matrixのrow / colもkeyboard definition（ADR 0002）も実機申告の容量（ADR 0003）も無い
- 168往復のread flow（ADR 0003）も、部分的に書けた状態からの復旧（ADR 0005）も起きない

したがってremapは**macOS host層**でしか行えない。選択肢はOSが提供する機構を使うか、
Karabiner-Elementsに寄せるか、同等品を自作するかになる。

調査で確認できた事実（詳細は`docs/tasks/ai-logs/2026-08-30_r-006-macos-keyboard.md`）。

- `hidutil property --set UserKeyMapping`は**1:1のusage remapのみ**で、layerもtap-holdも
  表現できない。加えて再起動で消えるためLaunchAgentが要る
- Karabinerはroot LaunchDaemonが`IOHIDDeviceOpen(kIOHIDOptionsTypeSeizeDevice)`で
  物理キーボードを**排他seize**し、**DriverKit System Extension**の仮想HID deviceへ
  再入力している。Input MonitoringとAccessibilityのTCC承認、Developer ID署名、
  notarizationが前提になる
- 同等品の自作に要る`com.apple.developer.driverkit.transport.hid`は**Appleの個別承認制**で、
  DriverKitはC++限定である
- CGEventTapによる軽量な自作は**入力元deviceを公開APIで識別できない**
  （`IOHIDEventGetSenderID`はprivate API）。加えてsecure inputで無効化され、
  tap timeoutでOSに切られる
- Karabinerの`device_if`は**`is_built_in_keyboard: true`**を持ち、要件がそのまま条件式になる
- `~/.config/karabiner/karabiner.json`は親ディレクトリをFSEventsでwatchし、外部編集を自動reloadする
- `karabiner_cli --lint-complex-modifications`はcore serviceへ接続しないため、
  **Karabiner-Elements.appを起動していなくても生成物を検証できる**

## 選択肢

1. DriverKit仮想デバイスとroot daemonを自作し、入力エンジンを内製する（Karabiner方式）
2. CGEventTapで軽量に自作する
3. Karabinerをengineとし、Cornix Bonsaiはdesired stateの単一の定義元とgeneratorに徹する
4. `hidutil`の1:1 remapだけに限定する

## 決定

案3を採る。

### 状態モデル

- desired stateは**`mac-keyboard.yaml`**（workspace直下、Git管理）。`keymap.yaml`とは別documentとする
- ADR 0006の「状態は`VilDocument`ただ1つ」は**Vial deviceの話**であり、
  Mac keyboardには射影元のraw層が存在しない。`VilDocument`へ寄せない
- 位置の識別は**Karabinerの`key_code`名**とする。matrixのrow / colを持たない
- 割り当ての無いキーは**書かない**。Karabinerは書かれていないキーを素通しするため、
  desired stateは疎なmapになる。Vialのように全キーを並べない

### keycode語彙

- QMK表記をdesired stateの語彙として流用する（`KC_A` / `MO(1)` / `LT1(KC_SPC)` / `TG(2)` /
  `LCTL_T(KC_ESC)`）
- `src/core/keycode/table.ts`の`createKeycodeTable`は`definition`と`capacities`を引数に取るため
  そのままは使えない。**pattern解析だけを純関数として切り出し**、Vial側の解決
  （custom keycode・容量範囲）とMac側の解決（Karabinerへ落とせるか）を分ける
- 現在の`ResolvedKeycode`は`TG(n)`とmod-tapを持たない。この2つをpatternへ追加する
- **Karabinerへ落とせないkeycodeはvalidation errorにする**。黙って捨てない（ADR 0006と同じ姿勢）

### layerの展開規則

- layer 0の割り当ては無条件のmanipulatorにする
- layer n（n≥1）は`conditions`へ`{ "type": "variable_if", "name": "cornix_layer_<n>", "value": 1 }`を加える
- 変数名は`cornix_layer_`で始める。Karabinerの変数はglobalなので接頭辞で隔離する
- **manipulatorを出さない**のは次の2つ。素通しがそのまま正しい挙動になる
  - `KC_TRNS`
  - layer nのキーがlayer 0と同値の場合
- `KC_NO`は`to`を持たないmanipulatorで表す（イベントを捨てる）
- `MO(n)` → `to: [set_variable 1]` + `to_after_key_up: [set_variable 0]`
- `LT n(kc)` → 上記 + `to_if_alone`
- `TG(n)` → Karabinerにtoggleが無いため`variable_if` / `variable_unless`で分岐した**2本**に展開し、
  **「立っているとき倒す」側を先に置く**
- mod-tap → `to: [{ key_code: <modifier>, lazy: true }]` + `to_if_alone`
- **ruleは上から評価され最初にマッチしたものが勝つ**ため、**高いlayerから順に出す**

### deviceスコープ

- 全manipulatorに`device_if: [{ is_built_in_keyboard: true }]` を付ける。Cornix LPを巻き込まない

### 所有境界

- Cornixが所有するのは`profiles[]`のうちnameが`Cornix Bonsai`の**profile 1個だけ**とする
- `global`と他のprofileには触らない
- `selected`は変更しない。未選択なら警告し、`karabiner_cli --select-profile`を案内する
- **diffとverifyは所有profileの構造で行う。テキストで比較しない**

### 適用経路

- 適用は**CLIのみ**とする。Browser UIは編集・validation・`cornix/generated/`への書き出しまで
- Apply手順は以下とする

  ```text
  karabiner.json を read
  → cornix/backups/karabiner-<時刻>.json へ backup
  → mac-keyboard.yaml を validate（Karabinerでの表現可能性を含む）
  → 所有 profile の構造 diff を表示
  → 人間が確認
  → temp + rename で atomic に置換
  → 再 read して所有 profile が一致することを verify
  → karabiner_cli --lint-complex-modifications
  ```

- ADR 0008の状態機械（`src/core/apply/plan.ts`）は**再利用しない**。同じ手順を踏む別実装にする

## 理由

- 案1が要求するのは入力ドライバ製品の開発であって、keymapエディタの機能追加ではない。
  entitlementのApple承認、C++でのsystem extension、root daemon、署名、notarization、
  `.pkg`配布が要る。これはADR 0020（GitHub Pages配布 / CLIはcloneして実行 /
  デスクトップアプリ化しない）の巻き戻しになる。得られるものはKarabinerと同じ挙動である
- 案2が落ちるのは表現力ではなく**deviceスコープ**である。CGEventTapはlayerもtap-holdも
  実装できるが、「内蔵キーボードだけ」を公開APIで判定できない。private APIへ依存すれば
  可能だが、OS updateで壊れる土台の上に実機の入力経路を載せることになる。
  加えてsecure inputとtap timeoutで**静かに効かなくなる**失敗モードを持つ
- 案4は要件のlayerとtap-holdを表現できない。`hidutil`が扱えるのは1:1のusage remapだけである
- 案3はプロジェクトの既存の立ち位置とそのまま一致する。Cornix Bonsaiは
  「Git管理するdesired stateを持ち、検証し、可視化し、人間の確認を経て適用する」ツールであり、
  実機の入力経路そのものは持たない。Cornix LPではfirmwareがengineで、
  MacBookではKarabinerがengineになる、という対応がつく
- desired stateを`VilDocument`へ寄せないのは、matrix・容量・definition digestという
  **存在しない概念を捏造する**ことになるため。ADR 0006が案2（materialize）を退けたのと
  同じ理由で、実体の無い構造を型として表現可能にしてはいけない
- 疎なmapを採るのは、Karabinerが「書かれていないキーを素通しする」というmodelだからである。
  Vialの「layerごとに全キーが定義される」を持ち込むと、素通しと明示的な同値割り当てが
  区別できない状態を作る
- 構造で比較するのは、`karabiner_cli --format-json`が独自整形（4 spaceインデント、
  1行に収まるobjectは1行）でファイルをin-place書き換えするのをSpikeで実測したため。
  Karabinerは自分でも同じwriterで`karabiner.json`を書き戻すので、テキスト比較にすると
  **Cornixが何も変えていなくてもdiffが出る**。ADR 0007がdefinition digestを
  canonical表現に対して取ったのと同じ問題である
- profile単位で所有するのは、`karabiner.json`がKarabinerの所有物でユーザーの他の設定も入るため。
  既存profile内のruleを`description`の接頭辞で所有する案も検討したが、ユーザーの他のruleと
  順序が混ざる。**ruleの評価順が意味を持つ**（高いlayerを先に出す必要がある）ので、
  順序を完全に制御できる単位で所有境界を引く
- 適用をCLIに限るのは、ADR 0007がworkspaceを「ユーザーが選んだ1つのディレクトリ」と
  決めているため。`~/.config/karabiner`はworkspace外で2つ目のpermission grantが要る。
  Chromiumのblocklistは`~/.ssh` / `~/.gnupg` / `~/Library`のみで`~/.config`を含まないため
  **技術的に不可能なのではなく設計として選ばない**。他アプリのglobal configをweb pageから
  書き換えるのは責務が壊れる。`karabiner_cli`によるverifyもNodeからしか叩けない
- ADR 0008の状態機械を再利用しないのは、前提が違うため。あちらは「168往復の途中で切れると
  部分的に書けた状態が残る」ことへの対処で、`WriteTarget`はwire値（u16）のwrite単位である。
  Karabinerへの適用は1ファイルのatomic置換で、部分的に書けた状態が原理的に生じない。
  同じ型を通すと、存在しない失敗モードのための構造を運ぶことになる

## 影響

- **Karabiner-Elementsが実行時の前提になる。** インストール、DriverKit extensionの承認、
  Input Monitoring / Accessibilityの許可はユーザーが行う。Cornix Bonsaiは自動化しない
- Cornix LPとMacBookで**2つの独立したdesired state**を持つ。同じ論理レイアウトを共有する
  仕組みは持たない。要求が出てから検討する
- Browser UIから適用できない。UI上で「実機Applyできるのはknown deviceだけ」という
  非対称が生まれるため、導線で明示する必要がある
- `src/core/keycode/table.ts`からpattern解析を切り出すと、Vial側の解釈経路にも変更が入る。
  `TG(n)`とmod-tapの追加はCornix LPのkeymapの解釈も変える（現在は`basic`として素通ししている）
- `karabiner_cli`のパスを前提にする。存在しない場合はlintをskipし、verifyの範囲が
  「再readして構造が一致すること」までに縮む
- `karabiner.json`のschemaはKarabinerのversionに依存する。生成物がlintを通ることを
  CIで担保できるのは**Karabinerが入っている環境だけ**である。GitHub ActionsのmacOS runnerには
  入っていないため、CIでは構造のunit testまでとし、lintはローカルのSpikeで行う

## Open Question

作業マシン（Mac mini Mac16,11）に内蔵キーボードが無いため、以下はMacBook実機でしか確認できない。

- `is_built_in_keyboard: true`がMacBook内蔵キーボードだけにマッチすること
- 同時接続したCornix LPに一切影響しないこと
- layerとtap-holdの実挙動。特に`to_if_alone`の閾値が打鍵感として妥当かどうか
- Karabiner起動中に外部から`karabiner.json`をtemp + renameで置換したときの競合挙動。
  親ディレクトリのwatchは壊れないはずだが、Karabiner側のin-memory stateとの競合は未検証
