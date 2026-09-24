# Web UI を board-desk の設計図で作り直す

## Fact

- uiux-numa `d2900ee` の `experiments/cornix-workbench` で、利用者が `board-desk` を採用した。README に部品の境界、hook の分け方、要件の置き場所がある。
- 旧 `src/ui/main.tsx` は 1274 行で、workspace、保存キュー、実機、差分、Apply、画面の分岐を 1 つの component に持っていた。
- 旧 UI の token（`dimension.css` / `typography.css` / `motion.css` / 画像由来の `color.css`）と React primitive（Button、Chip、Tag、Field、Section、Panel、Callout、SaveStatus）は ADR 0021 のもの。
- uiux-numa の `tokens/` は space、radius、border、size、typography、motion の生成物と LINE Seed JP の woff2（Regular 約 1.5MB、Bold 約 1.5MB）と OFL を持つ。
- `pop-toy` の `scheme.css` は prefers-color-scheme で明暗を切り替えるが、本体の `theme.ts` は `<html data-theme>` を決める。
- `experiments/button/shared/button.css` の角丸は `--radius-control` で、カプセル形と押下反応は `variants/pill-action/variant.css` 側にある。
- ADR 0030 が参照元に挙げた uiux-numa commit `4b3472e` は、どの branch からも辿れない。同じ変更は `c861f4b`（main）にある。
- DocBridge の対象は `src/**/*.ts` だけで、`.tsx` の部品は `src/ui/components/index.ts` で束ねて link する必要がある。
- `just format`（`oxfmt --write .`）は CSS も整形し、写した `typography.css` の長い行を折り返す。pre-commit の oxfmt は CSS を対象にしない。

## Decision

- `board-desk` の部品の境界に沿って `src/ui/components/` を作り直し、状態を `src/ui/state/` の 7 つの hook に分けた（ADR 0031）。
- `main.tsx` は描画前にテーマを決めて `App` を描くだけにした。
- Apply の gate の組み立て、開始できない理由、動作定義の値の検証、診断の群と飛び先は純関数へ出し、test を足した（`apply-gate.test.ts`、`behavior-edit.test.ts`、`diagnostics.test.ts`、`save-state.test.ts`）。
- Apply の書き込み処理（fingerprint の照合、operation ごとの write と verify、中断、完了後の full read）は旧 `main.tsx` の手順をそのまま `useApply` へ移した。
- 書き込み前の段階（backup、差分確認、確認）だけを UI の状態として足し、Core の `ApplyState` は変えなかった。
- backup の段階は、旧実装と同じく、この接続で読み込んだ実機状態を保存する。モックのように Apply の開始時に読み直すことはしない。
- warning の承認は、gate の evidence にある warning をすべて並べ、承認済みのものは checked で出す。旧 UI は未承認のものだけを並べていたため、一度承認すると外せなかった。
- Apply を開始できない理由に「gate に error がある」を足した（要件 T-08）。旧 UI は error があっても modal を開き、書き込みボタンだけを無効にしていた。
- 盤面の倍率は、grid が大きさを決める台（`.board-fit` は台いっぱいの絶対配置）の幅と高さから決め、encoder の帯の高さを引く（`useStageScale`）。
- uiux-numa の token は先頭に出典の注記を 1 行足しただけで写し、整形しない。本体固有の寸法は `tokens/layout.css` に分けた。
- 前回の directory の権限が `prompt` のときに入口で「アクセスを許可する」を出すため、`restoreWorkspace` の戻り値を `granted` / `prompt` の判別 union に変えた（要件 T-03）。
- ADR 0030 の参照先の誤りは、ADR 本文を書き換えず、ADR 0031 の影響とこの記録に残した。

### モックとの差

- `MockControls` と `useMockState` は移さず、状態は I/O の結果で決まる。
- encoder の名前は「encoder N」とし、モックの「（左）」「（右）」は付けない。index と物理位置の対応を確かめていないため（要件 P-01）。
- 検証パネルに severity の絞り込みを足した。旧 UI の status bar から severity 別に開く挙動を残すため。
- 編集パネルに動作 select を置いた。旧 UI の機能で、モックの README も限界として挙げていた。
- 全体マップの参照関係は、旧 UI の SVG の連結線ではなく、モックと同じく参照元の mini キーの強調で示す。
- 動作定義の値は、旧 UI の入力ごとの保存ではなく、モックと同じく Enter か blur で保存する。空欄は 0 として保存せず、範囲外として扱う。
- raw keycode は、旧 UI の入力ごとの保存ではなく、Enter か「反映」で保存する。
- picker で同じ値を選び直したときは保存しない。
- layer を切り替えても選択中の位置を保つ。旧 UI は選択を外していた。
- quiet の Button は、pill-action では hover のときだけ下線を出すが、面も枠も無いため常に下線を出す。

## Verification

- `just test`、`just typecheck`、`just build`、`just docbridge-check`、`just lint` を実行した。
- headless Chrome（CDP）で、File System Access API を差し替えた fixture の workspace（`baseline.vil` から `cornix import vil` で作った `keymap.yaml` と `fixtures/mac-keyboard/desired.yaml`）を開き、次を確かめた。
  - 1280 × 800 と 1024 × 768 で横スクロールが出ず、header が 1 行に収まり、盤面の台からはみ出さない（1u は 46px と 38px）。
  - 盤面の方向キー、Enter で編集パネルの見出しへ、Esc で盤面へ戻る。
  - picker での割り当てが `keymap.yaml` へ保存され、保存済みになる。Hold では modifier だけが選べ、選ぶと mod-tap になる。
  - パネルが中央の modal で開いて見出しへ focus し、Esc で閉じると入口へ focus が戻る。全画面にしたパネルが次も全画面で開く。
  - 検証の診断から該当 layer へ移り、パネルを閉じて盤面へ focus が戻る。
  - Tap Dance の timeout に 70000 を入れると保存せず理由を出す。
  - 外部変更を起こしてから編集すると、再試行を出さずに競合と再読込を出す。
  - Mac JIS で Karabiner に落とせない cell が無効になり、全体と動作の入口に「Cornix のみ」を出す。Mac ANSI のファイルが無いと盤面の位置に作成の導線を出し、作成できる。
  - ダークテーマで描画できる。
- 実機、WebHID の接続、実機読込、Apply の modal は browser で確かめていない。WebHID を差し替える Vial の emulator を browser 側に用意していないため。

## Open Question

- Apply の modal の各段階（backup、差分確認、確認、書き込み、中断、結果）は、WebHID を差し替えた browser の harness か実機で確かめる必要がある。
- `just format` が写した `typography.css` を整形してしまう。oxfmt の対象から `src/ui/styles/tokens/` を外すかは未決定。
- LINE Seed JP の woff2 約 3MB を GitHub Pages の配布物に含めた。subset 化するかは未決定。
- 要件 P-01（encoder と盤面上の押し込みキーの対応）、P-03（盤面の縦横比と余白）、P-06（JIS 盤面の座標の照合）は今回解いていない。
- 文字 125%、reduced motion、支援技術での読み上げは、今回の headless の確認に含めていない。
