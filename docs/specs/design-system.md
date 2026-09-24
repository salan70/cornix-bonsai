# Design System

寸法と書体の token、CSS の cascade layer 構成、Button、Icon、FitText の契約を定義する。
色 token の契約は [ui.md](./ui.md#light--dark-theme) に残す。
DocBridge は TypeScript の `export` 宣言だけを symbol 単位で link できるため、`styles/` 配下の CSS はファイル単位の link 対象にできない。
この節はそれらのファイルへの直接 link を持たず、パスを本文に記す。

## Token

寸法と書体と動きの token は uiux-numa の `tokens/`（commit `d2900ee`）の生成物を `src/ui/styles/tokens/` へそのまま写す。
写したファイルは space、radius、border、size、typography、motion、fonts の 7 つで、各ファイルの先頭に出典を記し、直接編集しない。
値を変えるときは uiux-numa 側で生成し直してから写し直す。
書体は LINE Seed JP の Regular と Bold で、woff2 と OFL を `src/ui/styles/tokens/fonts/` に置く。

uiux-numa の token に無い本体固有の寸法（骨格の幅、パネルの大きさ、keycap の角丸、小さな部品の大きさ、等幅の書体、小さい文字の段）は `src/ui/styles/tokens/layout.css` に置く。
値は uiux-numa の `experiments/cornix-workbench` の `board-desk` のモックから写した。
色は `src/ui/styles/tokens/color.css` だけが定義する（[ui.md](./ui.md#light--dark-theme)）。

### 幾何由来の例外

盤面と mini 盤面は実行時に大きさを実測して倍率を決めるため、token 化の対象から外れる。

- keycap の `--cap-font` / `--cap-sub-font` は、`useStageScale` と `useBoardScale` が返す 1u の px から TSX が算出する（[ui.md](./ui.md#keymap-editor)）
- 盤面と mini 盤面のキーの位置と大きさ、picker の cell の位置と幅は TSX の inline style で与える
- `@media` の breakpoint（1100px）は CSS の値として残し、同じ行へ `geometric` の印を付ける

`geometric` の印がある行は `design-system.test.ts` の直値検出から外す。

## Cascade layer

```css
@layer reset, tokens, base, components, features, utilities;
```

- `reset`: box-sizing、余白と list の正規化など、外観を持たない最小限の正規化
- `tokens`: `styles/tokens/*.css` の `:root` 宣言と `@font-face`
- `base`: 要素 selector への正規化だけを置く。`body` の色と書体、focus の輪、`code` の書体を持つ
- `components`: 複数の画面で使う部品。Button と Icon
- `features`: 画面の部位ごとの class。`shell.css`（header、rail、机、status bar）、`board.css`、`picker.css`、`inspector.css`、`panel.css`、`apply.css`、`workspace.css`
- `utilities`: 1 目的の class（`visually-hidden`、`spacer`、`muted`、`hint`）と、reduced motion で全ての動きを止める規則

`utilities` は最後の layer なので、reduced motion の規則は `components` と `features` の `transition` と `animation` より優先される。

keycode の種類の class（`kind-*`）は面の色の custom property（`--key-bg` / `--key-fg`）だけを決める。
選択中の表示は背景を直接上書きするため、種類の class と詳細度を競わない。
役割色の組（`tone-*`）も `--tone` / `--on-tone` / `--tone-soft` / `--on-tone-soft` の custom property だけを決める。

<!-- @code src/ui/components/index.ts#Button -->

## Button

Button は uiux-numa の `experiments/button`（採用 variant は `pill-action`、maturity は candidate）を写した。
役割は `primary` / `secondary` / `quiet` / `danger`、大きさは `small` / `medium` / `large` の 3 段である。
形はカプセルで、精密ポインタの hover では全体を 1.03 倍、押下では 0.97 倍にし、reduced motion ではどちらも止める。
disabled は薄くして押せないことを示し、理由は隣の文字で出す。
`quiet` は面と枠を持たず、下線で操作できることを示す。
見本ページ用の class と、本体で使わない loading と icon の枠は写していない。

<!-- @code src/ui/components/index.ts#Icon -->
<!-- @code src/ui/icons.ts#ICON_NAMES -->
<!-- @code src/ui/icons.ts#sanitizeIconSvg -->

## Icon

Icon は uiux-numa の `experiments/cornix-ui-icons`（commit `5215a3c`）で描いた機能アイコンを inline の SVG で描く（ADR 0032）。
SVG は `keycap-squircle` を `src/ui/icons/squircle/`、`keycap-dish-fill` を `src/ui/icons/dish/` へそのまま写し、直接編集しない。
名前は `ICON_NAMES` の 17 個で、2 組とも同じ名前のファイルを持つ。

- SVG は Vite の `import.meta.glob`（`query: "?raw"`、`import: "default"`、`eager: true`）で文字列として読む
- 読み込み時に 1 度だけ `sanitizeIconSvg` で `<title>`、`id`、`role="img"` を外す。同じ icon を 1 画面に複数置くと `part-*` の id が重複するため
- 描く組は `IconStyleContext` の値（[ui.md](./ui.md#icons) の設定）で決まり、設定の見本のように組を固定するときだけ `iconStyle` で上書きする
- 根の要素は `span.icon` で、`data-icon` に名前、`data-icon-style` に描いた組を持ち、`aria-hidden="true"` で読み上げから外す
- 大きさは `size` の `sm`（`--size-icon-sm`、16px）と `md`（`--size-icon-md`、20px）の 2 段で、token は `src/ui/styles/tokens/layout.css` に置く
- 色は `currentColor` で、隣の語の色を継ぐ
- CSS は `src/ui/styles/components/icon.css` で、SVG を枠の span いっぱいに描く

<!-- @code src/ui/components/index.ts#FitText -->
<!-- @code src/ui/fit-text-bus.ts#subscribeFit -->
<!-- @code src/ui/fit-text-bus.ts#notifyFit -->
<!-- @code src/ui/fit-text-bus.ts#observeFitContainer -->

## FitText: サイズ固定・文字を縮小

keycap、picker の cell、mini 盤面のキーは box の大きさを固定し、収まらない文字は `FitText` が font-size を段階的に縮めて収める。

- 基準の大きさは呼び出し側の CSS が決め、`FitText` は `--fit-scale` という掛け算の係数だけを持つ。例: `.keycap-main { font-size: calc(var(--cap-font) * var(--fit-scale, 1)); }`
- 測定は `el.parentElement` の padding を除いた content box に対して行う
- 縮小は `MIN_SCALE`（0.55）を下限とし、それでも収まらない場合は `overflow: hidden` と `text-overflow: ellipsis` が最終の fallback になる
- 盤面の倍率の変更と window の resize では `fit-text-bus.ts` の `notifyFit()` が再計測を促す
- picker のように大きさが百分率だけで決まり React の props が変わらない場所は、`observeFitContainer()` で container を直接 observe する

## 機械検証

`src/ui/design-system.test.ts`、`src/ui/theme.test.ts`、`src/ui/icons.test.ts` が以下を検証する。

- uiux-numa から写した token ファイルが出典 commit と編集禁止の注記を持ち、各 family の段を持つ
- `index.css` の先頭で layer の順を宣言し、token 以外の CSS はいずれかの layer に入る
- raw hex（`#rrggbb` 等）は `styles/tokens/color.css` にしか出現しない
- token 以外の CSS は、`geometric` の印がある行を除いて生の px / rem を含まない
- CSS のどこにも `!important` が出現しない
- CSS と TSX が参照する custom property は、CSS のどこかで定義されるか、TSX が実行時に与える
- CSS の class selector は TSX のリテラルの class 名か、`keycodeClass()` の値から作る `kind-*` に対応する。対応しない class は死んだ別名として扱う
- reduced motion では全ての `transition` と `animation` を止め、Button の hover の拡大も止める
- 2 組の icon がどちらも `ICON_NAMES` の 17 個をちょうど持ち、出典を記録し、色を `currentColor` だけで持つ
- `sanitizeIconSvg` が全ての icon から `<title>`、`id`、`role="img"` を外し、形を残す
- `color.css` は pop-toy の 24 役割を Light と Dark の両方に持ち、派生 token は役割色だけを参照する
- 本文と主要な操作の文字は 4.5:1、focus と操作の境界は 3:1 以上のコントラストを保つ
