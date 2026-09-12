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
