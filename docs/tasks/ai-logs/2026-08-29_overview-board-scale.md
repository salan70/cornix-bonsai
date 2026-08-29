# 2026-08-29 Overview の mini 盤面を card いっぱいへ広げる

対象: Overview 画面の layer card に余白が多いという指摘。

## Fact

- `LayerCard` は 1u を `Math.min(24, Math.max(14, floor(availableWidth / metrics.width)))` で決めていた。
- fixture `cornix-lp` の外接矩形は `width 14.5u / height 5.244u`。上限 24px のため盤面幅は 348px で頭打ちになる。
- 余った幅は `.mini-board { margin: 0 auto }` が左右へ振り分けるため、host 幅 538px なら 190px が余白になる。
- 倍率は幅だけから決めており、canvas に縦の空きがあっても盤面は大きくならなかった。
- `.overview-grid` は `repeat(3, minmax(0, 1fr))` 固定で、layer 数が 3 の倍数でないと右端のセル分の幅を捨てていた。
- `src/render/keyboard.ts` の SVG / PDF export は `geometry.ts` を使わない別系統で、画面の倍率とは独立している。

## Inference

- container の高さを実測して倍率へ使うと、container の高さが盤面自身の高さで決まる配置では倍率が自分の出力へ依存する。
  高さは「Overview が行数から配る予算」として渡す方が安定する。
- card 内の「盤面以外の高さ」は盤面の大きさに依らないため、`card.offsetHeight - host.offsetHeight` で実測しても
  循環しない。定数として持たなくてよい。
- 行を `1fr` で引き伸ばすと、幅が律速する場合に card の中へ大きな縦の空白が残る。行は内容で伸ばし、
  余りは grid の下へ残す方が指摘に沿う。

## Decision

- 倍率決定を `geometry.ts#fitUnit` へ集約し、`useBoardScale` は幅を実測、高さは任意の予算として受け取る形にした。
  Keymap editor は 30〜52px、Overview は 14〜52px の preset を使う。
- Overview は grid の実測サイズから列数と 1 枚あたりの高さ予算を出し、各 card へ配る。
  列数は 3 を上限に、行あたりの card 数が揃うところまで減らす（`overview-layout.ts#overviewColumns`）。
- 検証は fixture の外接矩形を使った静的 harness をブラウザで実測して行った（1280×800 / 1500×560 / 2000×1150、
  layer 5 件と 10 件）。いずれもページスクロールは発生しない。

| 状況                 | 変更前                                   | 変更後                |
| -------------------- | ---------------------------------------- | --------------------- |
| 2000×1150 / 5 layer  | 1u=24・盤面 348×126（横に 190px の余白） | 1u=37・盤面 537×194   |
| 2000×1150 / 10 layer | 1u=24・ページがスクロール                | 1u=25・スクロールなし |
| 1280×800 / 5 layer   | 1u=20・盤面 290×105                      | 同じ（幅が律速）      |
| 1500×560 / 5 layer   | 1u=24・ページがスクロール                | 1u=20・スクロールなし |

## Open Question

- 実アプリでの目視確認は File System Access API の workspace 選択が要るため、利用者の環境で行う。
- 盤面の縦横比（2.765）と grid セルの比が一致しないため、幅と高さのどちらかには必ず余りが出る。
  今回はそれを card の外（grid の下、または card 間）へ出す方針を採った。
