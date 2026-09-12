# MacBook物理盤面を手書きデータとしてCoreが所有し、Browser UIで編集する

状態: 採用

2026-09-12に、I-022で先送りしていた「Browser UIでの`mac-keyboard.yaml`編集」の設計を決めた。
適用がCLI専用であること（ADR 0022）は変えない。UIの責務は編集・validation・書き出しまで。

## 背景

I-022はBrowser UIの責務を`Mac書出`（Karabiner assetのワンショット書き出し）までとし、
編集はエディタで`mac-keyboard.yaml`を直接触る前提にした。盤面編集には物理配列定義の
新規作成が必要でスコープを超えるため（`2026-09-07_i-022-mac-keymap.md`）。
今回、既存のKeymapタブと同じ物理盤面レンダリングでの編集を実装する。

Cornix側の盤面はdefinition（`vial.json`）のKLEから導出するが、MacBook内蔵キーボードには
definitionに相当する外部入力が無い。盤面データをどう持つかが論点になる。

## 選択肢

1. 手書きの盤面データをCore（`src/core/mac-keymap/physical-layout.ts`）が所有し、
   不変条件testで固定する
2. MacBook相当のKLEを作り、既存の`toPhysicalLayout`へ通す
3. 盤面を描かず、テーブル形式の編集UIにする

## 決定

案1を採る。あわせて以下を決めた。

- **型は`PhysicalKey`を再利用しない**。`row` / `col`はVial matrixの概念でMacには存在しない
  （ADR 0022が退けたmaterializeと同型のため、偽のrow / colを振る案は不採用）。
  `MacPhysicalKey`は`keyCode`（Karabinerの`key_code`名 = 位置識別子）と幾何情報だけを持つ
- **geometryは`KeyShape`構造型へ一般化**した。`boardMetrics` / `keyBox`が読むのは
  幾何fieldだけで、`PhysicalKey`も`MacPhysicalKey`も構造的部分型として同じ関数を通る
- **JISとANSIの両盤面を持つ**。`macPhysicalLayout(layout)`がADR 0024の`layout`宣言に
  対応する盤面を返す。UI側にレイアウト切替UIは置かない（正はYAMLの宣言）
- **手書きデータはtestで固定する**。KLEのような入力検証が無いぶん、
  `KARABINER_POSITIONS`との整合・重複なし・`LAYOUT_MISSING_POSITIONS`不侵入・
  矩形の重なりなし・fixtureの全from位置の被覆を不変条件として持つ
- **Pickerで選べないkeycodeはdisabledにせず、validationに委ねる**。「Karabinerへ
  落とせるか」の正は`generateKarabinerRules`の閉じた表と各wrapperの表現可能性であり、
  UI側へ判定を複製すると必ず乖離する。pick直後に`validateMacKeymap`がerrorを出す
- **書き出しはin-memory documentから生成する**。編集UIが載ると、ディスク再読での
  生成は保存キュー未flushの編集を取りこぼす（stale read）。`Mac書出`はMacタブへ移し、
  UI状態の`MacKeymapDocument`から直接生成する

## 理由

- KLE経由（案2）はrow / colの捏造が必要になり、ADR 0022の判断と矛盾する。
  KLEはdefinitionという外部入力の形式であり、内部データの表現としては遠回り
- テーブルUI（案3）は物理配列定義が不要で工数最小だが、「どのキーに何を割り当てたか」を
  空間的に確認できる盤面の価値（既存Keymapタブと同じ体験）が要望の本体
- 盤面データの正しさは実行時に検証できないため、閉じた語彙（`KARABINER_POSITIONS`）との
  照合をビルド時（test）に固定するのが唯一の防壁

## 影響

- 盤面座標の根拠は2種で、区別して保守する
  - Fact: キーの存在集合（2026-09-06実機確認とHID usage定義。`LAYOUT_MISSING_POSITIONS`）
  - Inference: 座標・幅・高さ（Apple公開の製品画像からの読み取り。実測ではない）
- Touch ID / 電源キーは`key_code`が無いため盤面に置かない。JISの縦長Returnは
  矩形（1u x 2u）で近似する（`KeyBox`が矩形しか表現できないため）
- 適用はCLI専用のまま。Macタブには「実機への適用は`cornix mac apply`」の導線を明示する
  （ADR 0022の非対称の可視化）

## Open Question

- JIS盤面の座標を実機と照合していない。幅の読み取り誤りがあっても機能（割り当て編集）は
  壊れないが、見た目が実機とずれる。実機JIS MacBookでの目視照合をFactとして得たら
  作業ログへ記録し、必要なら座標を直す
- ANSI盤面は実機が無く、全面的にInference。US配列の実機Factが得られたら同様に照合する
