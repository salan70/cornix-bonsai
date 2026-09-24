# 機能アイコンを自前で描き、利用者が見た目を選ぶ

状態: 採用

2026-09-24に、uiux-numa の Experiment `cornix-ui-icons`（commit `5215a3c`）で利用者が採用したキーキャップ型の機能アイコン 2 組を、Web UI の文字の記号の置き換えとして取り込んだ。

## 背景

ADR 0031 の Web UI は、左端の入口、診断の重さ、保存状態、パネルの操作、encoder の回転方向、Apply の完了に文字の記号（⌨ ▦ ⚙ ✓ ⇅ ▤ ⛔ ⚠ ⓘ ◌ ○ ⤢ ⤡ × ↺ ↻ →）を使っていた。
記号は OS のフォントで形と太さが揃わず、`pop-toy` の配色と LINE Seed JP の造形にも合っていなかった。

ADR 0013 は icon に Lucide（`lucide-react`）を使い、1 つ目の icon を使う時点で入れると決めていた。
ADR 0021 は menu、dropdown、icon library を追加しないとし、Lucide の導入を保留したままだった。

uiux-numa では、Cornix の置き場所とサイズ（入口は 20px、それ以外は 16px）から 17 個の機能アイコンを 1 組で描いた。
利用者は 5 回の比較の後、超楕円のキーキャップの枠に記号を置く `keycap-squircle` と、その天面の凹みを淡い面（`fill-opacity` 0.1）で塗る `keycap-dish-fill` の 2 案を採用した。
どちらを使うかは Cornix Bonsai の利用者が設定で選ぶ、というのが利用者の指示である。

## 選択肢

1. ADR 0013 のとおり Lucide を入れ、同じ意味の icon に置き換える
2. uiux-numa で描いた 2 組の SVG を本体へ写し、自前の `Icon` 部品で inline に描き、利用者が組を選ぶ
3. 2 組のうち 1 組だけを写し、選択は設けない
4. 文字の記号を残す

## 決定

案 2 を採る。

- `keycap-squircle` と `keycap-dish-fill` の最適化済み SVG（各 17 個）を `src/ui/icons/squircle/` と `src/ui/icons/dish/` へそのまま写し、直接編集しない
- `Icon` は Vite の `import.meta.glob`（`?raw`、eager）で SVG を読み、読み込み時に `<title>`、`id`、`role="img"` を外して inline で描く
- `Icon` は読み上げから外し（`aria-hidden`）、意味は隣の語か操作の `aria-label` に持たせる
- 大きさは `--size-icon-sm`（16px）と `--size-icon-md`（20px）の 2 段の token で与える
- 見た目の設定は `dish`（凹みあり）と `flat`（凹みなし）の 2 択で、既定は `dish` とし、ブラウザの localStorage に保存する
- 設定はファイルのパネルの「表示」に置き、header には置かない
- 保存中の icon は回さない
- 置き換える場所と残す記号は [ui.md](../specs/ui.md#icons) に定める

## 理由

案 1 の Lucide は 1 本線の汎用 icon で、キーキャップの枠や天面の凹みのような Cornix 固有の造形を持たない。
17 個のために runtime の依存を 1 つ足すことにもなり、ADR 0021 の「icon library を追加しない」とも食い違う。
案 2 は追加の npm 依存を持たず、SVG を文字列として bundle へ含めるだけで済む。
色は `currentColor` なので、`pop-toy` の明暗と状態の色をそのまま継ぐ。
案 3 は利用者の指示（2 組を採用し、使う組は利用者が選ぶ）に反する。
案 4 は、記号の形と太さが OS のフォントで揃わない問題を残す。

既定を `dish` にしたのは、uiux-numa の Experiment で天面の凹みがキーキャップらしさを出すと判断された案だからである。
設定を header に置かないのは、1024px 幅で header を 1 行に保つためである（ADR 0031）。
ファイルのパネルは、読込・書出・再読込のように作業の合間に開く場所で、頻繁に変えない表示の設定を置いても割り当ての作業を妨げない。

SVG の `part-*` の id は、同じ icon を 1 画面に複数置く（status bar と検証パネルの error など）と重複するため、読み込み時に外す。
写した SVG を手で直すと出典との差分が生まれるため、外す処理は `Icon` 側に置く。
保存中の icon は 3 つの点で進行を示す形として描かれており、回すと枠ごと回るため回さない。

## 影響

ADR 0013 の icon の行（Lucide、10 個以内）は置き換わり、Lucide は入れない。
ADR 0021 の「icon library を追加しない」は維持する。
ADR 0031 の header、入口、パネル、status bar の配置は変えない。

icon の形を変えるときは uiux-numa 側で描き直し、2 組を写し直す。
error の icon は字の err で、16px では字の形まで読めない。
語と一緒に置き、形の違いで見分ける手がかりとして使う。
Dark では淡い面が明るい色を薄く重ねるため、凹みより盛り上がりに見えるおそれがある（uiux-numa の未解決の点）。

Apply の段階の完了は、番号の代わりに check の icon を出す。
icon は読み上げから外すため、完了した段階の番号は visually-hidden の文字（「n（完了）」）で添える。

## 却下理由

Lucide は Cornix 固有の造形を持たず、依存を足し、ADR 0021 の方針とも食い違うため却下した。
1 組だけを写す案は、使う組を利用者が選ぶという指示に反するため却下した。
文字の記号を残す案は、形と太さが OS のフォントで揃わない問題を残すため却下した。
uiux-numa で見送った `round-line`、`pop-duo`、`keycap-tile` などの案は、Experiment の記録に却下理由がある。
