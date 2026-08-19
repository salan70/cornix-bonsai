# 2026-08-19 D-001 Semantic Modelの境界を決める

対象Issue: #6 `[D-001] Semantic Modelの境界を決める`

## 調査方法

- ADR 0001〜0003を読み、D-001の入力として先送りされている項目を洗い出した
- `spikes/r-001-vil-roundtrip/roundtrip.mjs`と`spikes/r-002-cornix-lp-matrix/matrix-map.mjs`の
  動作するロジックを、TypeScriptの最小実装へ移植した
- `fixtures/cornix-lp/baseline.vil`と公式firmware V1.12のdefinitionの組で、
  境界が実際に成立するかをtestで確認した

## Fact

### ADRがD-001へ先送りしていた項目

- 正規化テーブルの単一の定義元（ADR 0001・0002・0003が3回とも提起）
- 物理配列をSemantic Model本体と分離した派生情報として扱うか（ADR 0002）
- `USERnn`をdefinition依存でどう解決するか（ADR 0002）
- `layout_options`をdefinition依存の情報としてどう表現するか（issue本文）

### 実測

- pinned Nodeはv24.19.0で`process.features.typescript === "strip"`。
  `.ts`が追加依存なしで実行でき、`node --test`でtestが走る
- `JSON.parse`のreviverの第3引数（source access）がNode 24で使える。
  Spikeの正規表現による`uid`置換は本実装では不要になった。
  ただしreviverはネストした`uid`も拾うため、holderの同一性でtop-levelだけを選ぶ必要がある
- `baseline.vil`は最小実装で**byte一致**する。`edge-cases.vil`はpythonが`1000.0`と書く数値を
  含むためbyte一致しないが、意味round-tripは成立する
- definitionから展開した物理キーは50個、encoderは2個×2方向。
  `baseline.vil`の非`-1`位置の集合と完全一致した
- `layouts.labels`は1 group（`Firmware Version` / 選択肢`V1.12`）を宣言するが、
  **どのキーも`labels[8]`を持たない**。つまりlayout選択肢で出し分けられるキーはゼロ
- `baseline.vil`の`layout_options`は`0`、`edge-cases.vil`は`-1`。
  `-1`は「Vialが実機から読まなかった」を意味し、`0`とは別状態

## Spike結果

Spikeは作らず、最小実装（`src/core/`）とtestで確認した。issueの完了条件が
「最小実装またはfixtureで確認できる」を求めているため、使い捨てコードではなく本実装で示した。

- `src/core/vil/`: raw層。parse・serialize
- `src/core/definition/`: definitionの読み込みとKLE展開
- `src/core/keycode/table.ts`: 正規化テーブル
- `src/core/model/`: 派生ビュー・layout_options・編集操作

test 29件が通る（`just test`）。境界の成立を示す中核は以下。

- definitionの`(row,col)`集合が`baseline.vil`の非`-1`位置と完全一致する
- `customKeycodes`の順序を入れ替えた合成definitionで、同じ`USER00`が別のnameに解決される
  → テーブルをモジュール定数にできない理由の証明
- `layerCount`を2にした容量で`MO(4)`が範囲外になる
  → 語彙が容量依存であることの証明
- Cornix LPは`gatesKeys: false`、`labels[8]`を持つキーを1つ足した合成definitionでは`true`
  → **no-opは「Cornixだから」ではなく「gateするキーがゼロだから」**であることの証明
- 編集後のexportが元と1トークンぶんだけ異なり、`uid`・key順・他fieldが無傷
  → 「rawが唯一の状態」が書き戻しまで成立することの証明

## Decision

ADR `docs/decisions/0006-semantic-model-boundary.md`（状態: 採用）に記録した。

rawを唯一の状態とし、意味表現はdefinitionを引数に取る派生ビューとして構成する（案3）。
正規化テーブルは`createKeycodeTable(definition, capacities)`として独立させる。

## Open Question

- QMKの基本keycode語彙の網羅は未着手。`LSFT_T(KC_SPACE)`や`0x1234`は表記を保ったまま
  素通ししている。網羅とu16対応はD-003で扱う
- `layout_options`のbit幅の解釈（選択肢n個で何bit消費するか）は未確認。
  fixtureは`0`と`-1`しか無いためどのbit幅規則でも結果が同じで、今回は判別できなかった。
  exportはrawをそのまま書き戻すため、round-tripはこの未確認に依存しない
- `key_override`と`macro`の意味解釈は未実装。macroのbufferをaction単位へ分解する処理
  （`macro_deserialize_v2`相当）はR-003からの持ち越しで、D-002の入力のまま
- ~~型検査を機械強制する経路が無い~~ → **解決**（2026-08-19）。
  `.pre-commit-config.yaml`の`typecheck` hookと`.github/workflows/typecheck.yml`を追加し、
  commitとpushの両方で止まるようにした。わざと型エラーを入れて`Failed`になることを確認済み
- 単一パッケージからの分割時期は未定。`core`がReact / fs / WebHIDをimportしないことは
  現状specへの明記とreviewで担保しており、lintでの機械強制は入れていない
