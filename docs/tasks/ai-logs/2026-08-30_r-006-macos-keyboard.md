# 2026-08-30 R-006 MacBook内蔵キーボードの管理方式を調査する

対象Issue: `[D-007] MacBook内蔵キーボードの管理方式を決める`

## 調査方法

- macOSがキーボードのremapに提供する機構を洗い出し、それぞれの表現力・永続性・
  device指定の可否を突き合わせた
- Karabiner-Elementsが実際に何をしているかを公式ドキュメントとprocess構成から確認し、
  同等品の自作に必要な資格・実装・配布の条件を出した
- 作業マシンの実状態（Mac model、Karabiner導入状態、DriverKit extensionの有効性、
  現行`karabiner.json`）を`system_profiler` / `systemextensionsctl` / `ioreg`で観測した
- Spike（`spikes/r-006-macos-keyboard/`）でQMK表記からKarabiner rulesを生成し、
  layerとtap-holdが表現できることと、生成物がKarabinerのlintを通ることを確かめた
- **実機への write は行っていない。** `~/.config/karabiner/karabiner.json`は読み取りのみで、
  Spikeの生成物は一時ディレクトリへ書いた

## Fact

### 依頼の前提の訂正

- 作業マシンは**Mac mini（Mac16,11 / M4 Pro）で、内蔵キーボードが存在しない**。
  接続されているのはBluetoothのApple製キーボード（VendorID 76 / ProductID 801）
- ユーザーへの確認により、対象は**別マシンのMacBook内蔵キーボード**と確定した

### Apple製キーボードにCornix LPと同じ経路が使えない

- Apple製キーボードはVial / VIA protocolを持たず、firmwareのkeymapを書き換えられない
- ADR 0004が引用済みのChromium `IsProtectedReportType`がkeyboard collectionのreportを隠すため、
  WebHIDからも触れない
- したがってremapは**macOS host層でしか行えない**。これはdevice adapterの追加ではなく、
  **別のdevice classの追加**である

### macOSが提供するremap機構

| 機構                                    | 表現力                                    | 永続性                                  | device指定         |
| --------------------------------------- | ----------------------------------------- | --------------------------------------- | ------------------ |
| System Settings → 修飾キー              | modifierの入れ替えのみ                    | あり                                    | あり               |
| `hidutil property --set UserKeyMapping` | 1:1のusage remapのみ。layer・tap-hold不可 | **再起動で消える**（LaunchAgentが要る） | `--matching`であり |
| Karabiner-Elements                      | layer・tap-hold・combo・device条件        | あり                                    | あり               |

要件はlayerとtap-holdなので、`hidutil`は表現力の時点で落ちる。

### Karabinerが実際にやっていること

- rootのLaunchDaemonが`IOHIDDeviceOpen(kIOHIDOptionsTypeSeizeDevice)`で物理キーボードを
  **排他seize**し、OSへのイベント到達を止める
- 加工したイベントを**DriverKit System Extensionの仮想HID device**へ流し込み、そこからOSへ再入力する
- Input MonitoringとAccessibilityのTCC承認、Developer ID署名、notarizationが要る

### 自作した場合に必要になるもの

| 経路                                   | 要件を満たすか | 障壁                                                                                                                                                                  |
| -------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DriverKit仮想デバイス（Karabiner方式） | 満たす         | `com.apple.developer.driverkit.transport.hid`は**Appleの個別承認制**。DriverKitはC++限定。root LaunchDaemonとsystem extensionのライフサイクル管理。署名済み`.pkg`配布 |
| CGEventTap                             | **満たさない** | 入力元deviceを公開APIで識別できない（`IOHIDEventGetSenderID`はprivate API）。加えてsecure inputで無効化され、tap timeoutでOSに切られる                                |

CGEventTapが落ちるのは表現力ではなく**device スコープ**である。「内蔵キーボードだけ」という
要件がなければ候補に残った。

### Karabiner側で要件に直接使えるもの

- `device_if`の**`is_built_in_keyboard: true`** — 「内蔵キーボードだけ」がそのまま条件式になる
- `~/.config/karabiner/karabiner.json`は親ディレクトリをFSEventsでwatchし、外部編集を自動reloadする。
  検知が壊れるのは**親ディレクトリを作り直した場合だけ**なので、temp + renameによる置換は安全なはず
- `karabiner_cli --lint-complex-modifications`が生成物を検証できる

### 作業マシンの実状態

- Karabiner-Elements 15.9.0導入済み。DriverKit extensionは`activated enabled`
- ただし`karabiner_console_user_server`は未起動で、`--list-connected-devices`は
  `core_service_client connect_failed`で失敗する
- 現行の`karabiner.json`は`virtual_hid_keyboard`だけのほぼ空の状態。
  `complex_modifications`も`devices`も持たない
- `assets/complex_modifications/`に手動importした資産が2件ある

## Spike結果

`spikes/r-006-macos-keyboard/`。検証25件すべて成功。

```bash
nix develop -c node spikes/r-006-macos-keyboard/self-check.mjs
```

### 表現できることの確認

`MO(n)` / `LT n(kc)` / `TG(n)` / mod-tapがすべてmanipulatorへ落ちた。

- `MO(n)` → `to: [set_variable 1]` + `to_after_key_up: [set_variable 0]`
- `LT n(kc)` → 上記 + `to_if_alone`
- `TG(n)` → Karabinerにtoggleが無いため、`variable_if` / `variable_unless`で分岐した**2本**に展開する。
  「立っているとき倒す」側を先に置く。逆にすると押した直後に立て直す
- mod-tap → `to: [{ key_code: modifier, lazy: true }]` + `to_if_alone`。
  `lazy`を付けないとhold側のmodifierが単独で発火する

### 出さないことが正しい挙動になる

Karabinerは**書かれていないキーを素通しする**ため、`KC_TRNS`と「layer 0と同値のキー」は
manipulatorを出さないことがそのまま正しい。`KC_NO`は`to`を持たないmanipulatorで表す。

これはVialのmodelとの構造的な差である。Vialはlayerごとに全キーが定義されるが、
Karabinerは差分だけを書く。desired stateも**疎なmap**にできる。

### lintは core service 無しで通る

`karabiner_cli --lint-complex-modifications`はcore serviceへ接続しないため、
**Karabiner-Elements.appを起動していなくても生成物を検証できる**。CIでも使える。

### テキスト比較でdiffを取れない（重要）

`karabiner_cli --format-json`は独自整形（4 spaceインデント、1行に収まるobjectは1行）で
ファイルをin-place書き換えする。`JSON.stringify(x, null, 2)`とも`null, 4`とも一致しない。

`json`のfenceに置くとoxfmtが整形してしまうため、`text`のまま引用する。
インデントは4 spaceで、1行に収まるobjectは1行に畳まれる。

```text
{
    "type": "basic",
    "from": { "key_code": "a" },
    "to": [{ "key_code": "b" }]
}
```

Karabinerは自分でも同じwriterで`karabiner.json`を書き戻すため、**Applyのdiffとverifyを
テキスト比較で行うと毎回ノイズが出る**。所有profileの構造で比較する必要がある。
ADR 0007がdefinition digestをcanonical表現に対して取ったのと同じ問題である。

## Decision

ADR `docs/decisions/0022-macos-keyboard-management.md`（状態: 採用）に記録した。

Karabiner-Elementsをengineとし、Cornix Bonsaiはdesired stateの単一の定義元と
generatorに徹する。入力エンジンは自作しない。

## Open Question

このマシンに内蔵キーボードが無いため、以下はMacBook実機でしか確認できない。

- `is_built_in_keyboard: true`がMacBook内蔵キーボードだけにマッチすること
- 同時接続したCornix LPに一切影響しないこと
- layerとtap-holdの実挙動（打鍵感、`to_if_alone`の閾値の妥当性）
- Karabiner起動中に外部から`karabiner.json`をtemp + renameで置換したときの競合挙動。
  親ディレクトリのwatchは壊れないはずだが、Karabiner側のin-memory stateとの競合は未検証

加えて設計上の未確定事項が1つある。

- 同じ論理レイアウトをCornix LPとMacBookで共有したくなった場合の扱い。
  現時点では2つの独立したdesired stateとし、共有は要求が出てから検討する
