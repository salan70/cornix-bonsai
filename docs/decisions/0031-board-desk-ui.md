# Web UI を board-desk の設計図で作り直す

状態: 採用

2026-09-24に、uiux-numa の Experiment `cornix-workbench` で利用者が採用した `board-desk`（uiux-numa commit `d2900ee`）を、本体の UI 層を作り直す設計図として取り込んだ。
要件は [Web UI 要件](../tasks/2026-09-24_ui-requirements.md)（W-01〜22、S-01〜07、T-01〜12、C-01〜15）である。

## 背景

反復 2 の移植（ADR 0029 / 0030）で変わったのは、ナビゲーションと外枠だけだった。
本文の部品、`main.tsx` の 1 つの component に集中した状態、本体独自の token は旧来のまま残り、採用したモックとの差が大きかった（要件 P-05）。
原因は 2 つある。
モックが固定の見せかけデータで作られ、recovery、WebHID、VIL、backup、Karabiner 書出、acknowledge を含まなかったこと。
本体側の ADR が「既存の構成と状態管理を維持する」ことを前提にしたこと。

uiux-numa では要件から情報設計を導き直し、画面だけでなく部品の境界と状態の持ち方まで含めた `board-desk` を実装した。
利用者は 4 方向の静的なモックから `board-desk` を選び、操作できる variant を確かめて採用した。
設計図の要点は次の 3 つである。

- 盤面、picker、編集パネルを常設し、全体マップ・動作定義・検証・実機と適用・ファイルは左端の入口から画面中央のパネル（全画面へ広げられる）で開く
- Apply は段階を終えるまで他の作業へ移れない modal としてパネルと区別する
- 状態を関心ごとの hook に分け、各 hook は他の hook の内部を読まない

## 選択肢

1. 反復 2 の構成を維持し、部品の見た目だけを `board-desk` に寄せる
2. `board-desk` の部品の境界と hook の分け方に沿って `src/ui` を作り直し、uiux-numa の token と `pop-toy` の配色と `pill-action` の Button を取り込む
3. `board-desk` のモックのコードをそのまま本体へ持ち込み、固定データを本体の状態へ差し替える

## 決定

案 2 を採る。

- 画面は header、左端の入口、机（layer の切替、盤面、picker、編集パネル）、status bar で組み、作業パネルは native の `<dialog>` で開く
- 編集対象の切替は左端のカードから header の radiogroup へ移し、読込状態を印で添える
- 接続、実機読込、backup 復元は header の補助メニューから「実機と適用」パネルの 3 段階へ、VIL と再読込は「ファイル」パネルへ移す
- `main.tsx` の状態は `src/ui/state/` の `useWorkspace`、`useCursor`、`useDevice`、`useApplyGate`、`useApply`、`useTheme`、`useStatus` に分け、`App` が値と操作を受け渡す
- Apply の gate の組み立てと動作定義の値の検証は、React に依存しない純関数（`apply-gate.ts`、`behavior-edit.ts`、`diagnostics.ts`）へ出して test する
- 寸法、書体、動きの token は uiux-numa `d2900ee` の `tokens/` を写し、配色は `pop-toy` の 24 役割を `data-theme` 属性で切り替える形で写す
- Button は uiux-numa の `experiments/button`（`pill-action`）を写し、旧来の React primitive（Chip、Tag、Field、Section、Panel、Callout、SaveStatus）は廃止する
- cascade layer の構成（`reset, tokens, base, components, features, utilities`）は維持する
- Core、ファイル形式、CLI、Apply の安全手順は変えない

## 理由

案 1 は反復 2 と同じく外枠だけの後付けになり、部品の境界と状態の持ち方の問題（P-05）が残る。
案 2 は要件の作業頻度に合わせた面積の配分と部品の境界を、本体の状態と Core の関数で実現できる。
案 3 はモックの固定データ前提の状態（`useMockState` など）と近似した keycode 処理を持ち込み、本体の Core と二重になる。

## 影響

ADR 0011 の「workspace を入口とする 4 tab」の構成は、常設の盤面と 5 つの作業パネルに置き換わる。
ADR 0011 の Apply を線形の modal に分ける決定、backup・差分・確認・write+verify・結果の順序、往復回数での進捗は維持する。
ADR 0029 の header の補助メニューと、rail の中の対象別タブは廃止する。
ADR 0030 の編集対象のカードと作業項目の rail は、header の radiogroup と左端の入口へ置き換わる。
ADR 0030 の「使えない作業は位置を保って無効表示し理由を出す」と、保存状態と Apply を status bar に置く決定は維持する。
ADR 0021 の寸法・書体 token（`dimension.css` / `typography.css` / `motion.css`）と React primitive は、uiux-numa の token と Button に置き換わる。
ADR 0021 の cascade layer と、機械検証で規約を守る方針は維持する。

作業パネルは modal なので、開いている間は盤面を見られない。
全体マップや検証から盤面の位置へ移る操作は、パネルを閉じてから盤面へ focus を移す。
layer を切り替えても選択中の位置を保つようにしたため、旧 UI の「layer を切り替えると選択を外す」挙動は無くなった。
LINE Seed JP の woff2（Regular と Bold で約 3MB）を配布物に含める。
Apply の段階表示は Core の `ApplyState` を変えず、書き込み前の段階（backup、差分確認、確認）だけを UI の状態として持つ。
ADR 0030 が参照元に挙げた uiux-numa commit `4b3472e` は rebase で履歴から外れ、同じ内容は `c861f4b` にある。

## 却下理由

部品の見た目だけを寄せる案は、反復 2 で外枠だけの移植に終わった原因を残すため却下した。
モックのコードをそのまま持ち込む案は、固定データ前提の状態と Core の近似を本体へ持ち込むため却下した。
uiux-numa で実装前に見送った `layer-shelf`、`key-palette`、`sync-lanes` の各案は、Experiment の記録に却下理由がある。
