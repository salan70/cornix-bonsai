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
