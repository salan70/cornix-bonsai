# 機能アイコンを自前で描き、利用者が見た目を選ぶ

## Fact

- uiux-numa `5215a3c` の `experiments/cornix-ui-icons` で、利用者が `keycap-squircle` と `keycap-dish-fill` の 2 案を採用した。README に置き場所とサイズの対応表がある。
- 2 組の違いは、天面の凹みを `fill-opacity` 0.1 の面で塗る path が 1 本あるかどうかだけである。
- 配布用の SVG は、根に `role="img"` と `<title>`（日本語名）を持ち、すべての path に `part-<asset>-*` の id を持つ。色は `currentColor` だけである。
- 保存中の `saving` は 3 つの点の静止した形で、README の表の「回して使う」は round 2 以前の 4 分の 3 の輪の記述が残ったものである（枠の中の形の表で 3 つの点に替わっている）。
- ADR 0013 は Lucide を 1 つ目の icon を使う時点で入れるとし、ADR 0021 は icon library を追加しないとしていた。本体は Lucide を入れていない。
- 本体のテストは `node --test` で `.ts` を直接走らせるため、`import.meta.glob` を使う `Icon.tsx` は test から読めない。
- `just format` は写した `typography.css` を折り返すため、整形後に元へ戻した（ADR 0031 の作業ログと同じ）。

## Inference

- 同じ icon は status bar と検証パネルなどで 1 画面に複数並ぶため、id を残すと重複する。id と title を外す処理を純関数に分ければ、SVG ファイルを読む test で全 34 個を検証できる。
- icon は `aria-hidden` の span の中にあるため、`role="img"` を残しても読み上げには出ないが、名前の無い img の role を残す理由も無い。
- encoder の帯は `font-size-xs` の文字の横に 16px の icon が並ぶため、帯の 1 行目がわずかに高くなる可能性がある。

## Decision

- 2 組の SVG を `src/ui/icons/squircle/` と `src/ui/icons/dish/` へそのまま写し、出典と編集禁止を `src/ui/icons/README.md` に記した（ADR 0032）。
- `sanitizeIconSvg`（`src/ui/icons.ts`）が `<title>`、`id`、`role="img"` を外す。`Icon` は読み込み時に 34 個すべてへ 1 度だけ当て、描画のたびには当てない。
- `Icon` の根は `span.icon`（`icon-sm` または `icon-md`）で、`data-icon` に名前、`data-icon-style` に描いた組、`aria-hidden="true"` を持つ。
- 見た目の設定は `src/ui/icon-style.ts`（`theme.ts` と同じ形）と `useIconStyle` に置き、`IconStyleContext` で配った。保存の鍵は `cornix-bonsai.icon-style`、既定は `dish` である。
- localStorage の取得は `theme.ts` の `browserThemeStorage()` を使い回した。中身は `window.localStorage` を安全に返すだけで、テーマに固有の処理を持たない。
- 設定はファイルのパネルの「表示」に、`.seg` のラジオボタン 2 つ（凹みあり / 凹みなし）で置き、各選択肢に `keymap` の見本をその組で描いた。
- 変更なし（idle）の保存状態は icon を出さず、icon の幅だけを空けて文言の位置を揃えた。以前の丸い背景（`--size-save-icon`）は枠が二重になるため外し、使われなくなった token を消した。
- 保存中の回転（`save-spin`）を消した。
- 入口の色のタイルからは文字の大きさ（`--font-size-icon`）を外した。`--font-size-icon` は brand の logo が引き続き使う。
- encoder の `aria-label` から ↺ ↻ を外し、「左回し」「右回し」の語だけにした。
- `App` の JSX を `desk` に受けてから `IconStyleContext.Provider` で包み、既存の JSX の字下げを変えなかった。workspace を選ぶ前の入口には icon が無いため、Provider で包んでいない。

### 置き換えた記号

| ファイル                                  | 置き換え前                                                                         | 置き換え後                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `components/Rail.tsx`                     | ⌨ ▦ ⚙ ✓ ⇅ ▤                                                                        | `keymap` `overview` `behaviors` `validation` `device` `files`（20px） |
| `diagnostics.ts`（`SEVERITY_VIEW`）       | ⛔ ⚠ ⓘ                                                                             | `error` `warning` `info`                                              |
| `components/StatusBar.tsx`                | `SEVERITY_VIEW` の記号                                                             | `Icon`                                                                |
| `components/panels/ValidationPanel.tsx`   | `SEVERITY_VIEW` の記号                                                             | `Icon`                                                                |
| `components/ApplyDialog.tsx`              | warning の記号、⛔、段階の ✓、backup の ✓、書き込みの行の ✓ と ◌、完了の見出しの ✓ | `warning` `error` `check` `saving`                                    |
| `components/panels/DevicePanel.tsx`       | ⛔                                                                                 | `error`                                                               |
| `components/Inspector.tsx`（`SAVE_VIEW`） | ◌ ✓ × !、○                                                                         | `saving` `check` `error` `warning`、idle は icon なし                 |
| `components/Inspector.tsx`                | 「→ layer を開く」の →                                                             | `arrow-right`                                                         |
| `components/PanelDialog.tsx`              | ⤢ ⤡ ×                                                                              | `expand` `collapse` `close`                                           |
| `components/Board.tsx`                    | encoder の帯の ↺ ↻                                                                 | `rotate-ccw` `rotate-cw`                                              |

### 置き換えなかった記号

- `Header` と入口の brand の 🌱
- keycap の刻印記号（⌘ ⌥ ⌃ ⇧ ⏎ など、`keycode-labels.ts` と `mac-keycap-labels.ts`）
- CSS で描いた点（接続状態、差分、layer の色点）
- 盤面の小さな診断の印（`Board.tsx` のキーと encoder の帯の × と !）
- 全体マップの参照元の「←」（`OverviewPanel.tsx`）と、読み上げから外した mini 盤面の ↺ ↻
- 実機パネルの差分の文中の「→」（`DevicePanel.tsx`）、参照の件数の「×」（`ValidationPanel.tsx`）

## Verification

- `just test`（358 件、うち追加 8 件）、`just typecheck`、`just build`、`just docbridge-check`、`just lint` を実行した。
- `icons.test.ts` が 2 組の 17 個の有無、出典の記録、`currentColor` だけの色、`dish` だけの淡い面、`sanitizeIconSvg` の後に title・id・role が残らないことを確かめる。
- `icon-style.test.ts` が既定値、不正値、読み戻し、root への反映、Storage 例外を確かめる。
- Vite の `ssrLoadModule` で `Icon` を server 側で描き、同じ icon を 2 つ並べても id と title が出ないこと、既定が `dish` で淡い面を持つこと、`IconStyleContext` を `flat` にすると淡い面が消えることを確かめた。
- browser での見た目は、実装の時点では確かめていない。
- 統合前に、fixture の workspace を headless Chrome の OPFS に置いて実画面を確かめた。既定が `dish` であること、icon がすべて `aria-hidden` であること、SVG に id と title が残らないこと、置き換えた記号が画面に残らないこと、設定の切り替えと再読込後の保持、1024 × 768 で header が 1 行に収まること、ライトとダークの表示を確かめた。

## 統合前の修正

- Apply の完了した段階に、番号を visually-hidden の文字（「n（完了）」）で添えた。icon を読み上げから外したため、番号が読み上げで消えていた。
- 動作定義の保存失敗の「×」を error の icon にした（`BehaviorsPanel.tsx`）。
- encoder の帯の回転の icon と語を横に並べて中央で揃え、薄くするのを語だけにした（`.slot-dir`、`.slot-dir-label`）。icon が薄い 12px の文字と同じ行に置かれ、縦位置も揃っていなかった。

## Open Question

- Dark で `dish` の淡い面が凹みより盛り上がりに見えるかは、利用者が実画面で判断する。
