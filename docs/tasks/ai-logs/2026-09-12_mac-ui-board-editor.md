# Mac内蔵キーボードのブラウザ盤面編集UI

日付: 2026-09-12 / ADR: 0025（予定） / 先行: I-022（UI編集の先送り判断）

## 目的

`mac-keyboard.yaml`をBrowser UIで、既存のKeymapタブと同じ物理盤面レンダリングで
編集できるようにする。I-022では「物理配列定義の新規作成を伴いスコープ超過」として
UI編集を先送りし、書き出し（`Mac書出`）のみ実装していた。適用はADR 0022のとおり
CLI専用のままで、UIは編集・validation・書き出しまで。

スコープ: 盤面データはJISとANSI（US）の両方。workspaceは従来どおり`keymap.yaml`必須。

## Step 1: geometryのKeyShape構造型化

- `src/render/geometry.ts`へ`KeyShape`（x / y / width / height / rotation 3値）を導入し、
  `boardMetrics` / `keyBox` / `corners`の引数型を`PhysicalKey`から緩めた。
  geometryが実際に読むfieldはこの7つだけ（読み替え無しの挙動不変リファクタ）
- `PhysicalKey`は構造的部分型としてそのまま通るため、既存呼び出し側は無変更
- Mac盤面はmatrix（row / col）を持たないため、`PhysicalKey`へ偽のrow / colを振る案は
  ADR 0022が退けたmaterializeと同型として不採用
- test: 既存geometry.test.tsの全維持 + matrixを持たないKeyShape直渡しの固定test

## Step 2: JIS / ANSI物理盤面データ（ADR 0025）

- `src/core/mac-keymap/physical-layout.ts` — `MacPhysicalKey`と`macPhysicalLayout(layout)`。
  位置識別子はKarabinerの`key_code`名、matrixのrow / colは持たない
- 判断の本体はADR 0025（手書きデータのCore所有・PhysicalKey不採用・test固定・
  pickerのvalidation委任・書き出しのin-memory化）
- 盤面はJIS / ANSIとも幅14.5u。function行は高さ0.65u、矢印は0.5u、JISの縦長Returnは
  1u x 2uの矩形近似。Touch ID / 電源は`key_code`が無いため置かない
- 座標の根拠の区別:
  - Fact: キーの存在集合（2026-09-06実機確認 + HID usage定義 = `LAYOUT_MISSING_POSITIONS`）
  - Inference: 座標・幅・高さ（Apple公開の製品画像からの読み取り。実機JISでの目視照合は
    未実施 → ADR 0025のOpen Question）
- test: `KARABINER_POSITIONS`整合・重複なし・`LAYOUT_MISSING_POSITIONS`不侵入・
  矩形の重なりなし（AABB + ε）・fixture全from位置の被覆・外形14.5u x 5.65u

## Step 3: Core編集関数

- `src/core/mac-keymap/edit.ts` — `setMacAssignment` / `clearMacAssignment` / `addMacLayer`。
  `src/core/model/edit.ts`と同じ思想（表記のまま置く、妥当性はvalidationへ委任）
- 疎なmapゆえの違い: 「範囲外」が無く、無いlayerへの書き込みはlayerを作る。
  削除（素通し）と`KC_NO`（イベント破棄）は別セマンティクスなので削除専用関数を持つ。
  空になったlayerは残す（layer chipが消える驚きを避ける）
- test: 不変性・layer自動生成・同一document返却（no-op時）・空layerのround-trip

## Step 4: KeycodePickerの選択解決切り離し（挙動不変）

- `KeycodePicker`のpropsを`table` / `selectedKeycode` / `disabled` / `onPick(picked)`ベースへ
  変更し、`selectedInput`（view + selectionからの編集対象解決）と`applyPick`での合成・
  保存先分岐を`KeymapTab`側へ移した
- pickerはVialのview / Selectionに依存しなくなり、Macタブが同じpickerを使える。
  未割り当て（Macの素通し）は`selectedKeycode: undefined`のまま渡す設計
- `canPick`によるcell無効化と`targetValue`（Tap / Hold現在値）はpicker内に残す
  （pickTargetの表示都合であり、編集対象の型に依存しない）
- 挙動不変。手動確認: Keymapタブでキー / encoderを選択→pick→保存、Tap / Hold切替、
  未選択時の全無効化

## Step 5: workspace統合とMacタブ骨格

- `src/ui/mac-workspace.ts` — `MacWorkspaceState`（ready / missing / error）と
  `probeMacKeymap`。parse失敗を`error`に閉じ込め、Macの不調でworkspace全体
  （Vial編集）を止めない。`initialMacKeymapYaml`は作成導線の初期状態
  （既定layout + 空layer 0）
- `WorkspaceModel.mac`を追加し、`probeStore`のready分岐で読む。`keymap.yaml`必須は不変
- `macSaveQueue`（3本目の`createSaveQueue`、競合token独立）を`adoptWorkspace`で構築
- `Tab`へ`"Mac"`を追加（Keymap / Overview / Behaviors / Mac / References）。
  `MacKeymapTab`はmissing（作成ボタン）/ error（理由 + 再読込案内）/ ready
  （このstepでは概要のみ。盤面はStep 6）を描く
- specs/ui.mdの「4 tab」を「5 tab」へ改訂し、`#mac-tab`節を追加

## Step 6: 盤面編集本体

- `MacKeymapTab`のready状態を実装。盤面はCornixと同じgeometry（`boardMetrics` / `keyBox` /
  `useBoardScale`）で描画し、割り当ての無いキーは素通しとして物理キャップ名をfaint表示
  （`.key.is-passthrough`、`features/mac.css`）
- `src/ui/mac-board.ts` — 盤面entry構築の純関数（`macBoardEntries` / `macLayerNumbers` /
  `nextMacLayer`）。物理配列を正とし、YAMLにだけある位置はvalidationへ委ねる
- `src/ui/mac-keycap-labels.ts` — from側キャップ表示名。同じ`key_code`でも刻印は配列で
  変わる（JISの`equal_sign`は`^`）ため配列別の表を持つ。両盤面の網羅をtestで固定
- `moveKey`を幾何ベース（`KeyShape`の`physical`を持つ任意の配列）へ一般化し両盤面で共有。
  盤面entryでの移動をtestで固定（staggerによりjの直下はn）
- `Selection`へ`{kind: "macKey", keyCode}`を追加。Macのlayer番号空間はVialと別なので
  `macLayer` stateを分離
- `MacKeyPanel` — from位置表示・動作select・raw keycode入力（空文字=素通し）・
  「割り当てを外す」。`KC_NO`（イベント破棄）と素通しを別操作として見せる
- `saveMac`は`setMacAssignment`等の純関数の結果を3本目のsaveQueueへ流す。
  keycode表示のlabelsはlayer名を剥がして渡す（Vialのlayer名の誤適用防止）
