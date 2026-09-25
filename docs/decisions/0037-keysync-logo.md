# ロゴを盤面から 1 個のキーが浮くマークにする

状態: 採用

2026-09-25に、uiux-numa の Experiment `keysync-logo`（commit `3001a41`）で利用者が採用した `tilt-confetti` を、KeySync のロゴと favicon として取り込んだ。

## 背景

ADR 0035 で製品名を Cornix Bonsai から KeySync へ改めた。
ロゴは絵文字 🌱 で、旧名の bonsai から来ており、新しい名前とも道具の役割とも結び付かなかった。
🌱 は黄のキーキャップ型の箱（`.logo`）の中に置かれ、favicon は無かった。

uiux-numa では、利用者が決めた 4 系統の比喩（キーキャップが揃う、文字 K、同期の矢印や円環、盤面の抽象化）で 10 案を作った。
利用者は盤面の系統を選び、1 軸ずつ変えた派生と、K と S を読ませる案を比べた後、`tilt-confetti` を採用した。
盤面から 1 個のキーだけが傾いて浮き、盤面のキーを青、赤橙、墨に散らし、浮いたキーだけを黄にするマークである。

## 選択肢

1. 多色版を箱なしで置き、favicon も多色にする
2. 単色版を黄の箱の中に置き、favicon は単色にする
3. 🌱 を残す

## 決定

案 1 を採る。

- uiux-numa の最適化済み SVG を `src/ui/icons/logo/keysync.svg` へそのまま写し、直接編集しない
- `Logo` は SVG を `?raw` で読み、`part-mark-*` の id を対応表の class へ置き換えて inline で描く
- 色は `.logo` の CSS で塗る。黄、青、赤橙は `--color-primary`、`--color-secondary`、`--color-tertiary`、墨のキーは文字色を継ぐ
- 黄の箱（`.logo` の背景と下辺の影）を外す
- favicon は `public/favicon.svg` に同じ形で置き、色を SVG に書く。墨のキーだけを `prefers-color-scheme` で明暗に切り替える
- 大きさは header が `--size-logo`（36px）、workspace の入口が `--size-logo-large`（64px）で、既存の token を使う

## 理由

案 2 は、黄の浮いたキーが黄の箱に溶け、Pop Toy の色がマークから消える。
マーク自体がキーボードの盤面なので、キーキャップ型の箱で囲む必要も薄い。
案 3 は、改名の理由（Cornix LP に限らない複数のキーボードの道具）を表さない。

favicon だけに色を書くのは、ブラウザのタブには画面の CSS が届かないためである。
`currentColor` のままでは黒 1 色になり、暗いタブで沈む。
favicon を明暗の 2 枚に分ける案は、形の写しが増えるので採らない。

id を class へ移すのは、header と入口に同じマークを置いても id が重複しないようにするためである。
写した SVG を手で直すと出典との差分が生まれるため、移す処理は `Logo` 側に置く（ADR 0032 の `Icon` と同じ扱い）。

## 影響

ADR 0011 と 0029 の header の brand は、🌱 の箱から、このマークと「KeySync」の並びに置き換わる。
配置と大きさは変えない。
`--font-size-logo-large` と `--font-size-icon` は 🌱 の大きさだけに使われていたので削除する。
