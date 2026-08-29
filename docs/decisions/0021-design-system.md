# 寸法・タイポグラフィをtoken化し、cascade layerとReact primitiveでUIの語彙を1つにする

状態: 採用

2026-08-29に、`src/ui/styles.css`と13個のUI componentの実測から色以外に規約が無いことを確認して決めた。

## 背景

ADR 0013はCSSを「plain CSSとCSS Modules。tokenはCSS custom properties」と決め、Issue #16で
`tokens.css`にcolor tokenを導入した。`theme.test.ts`がsampled palette、light/dark切り替え、
contrast比、raw hexの単一定義元を機械検証しており、color層は完成している。

一方でcolor以外は無規律に増えた。`src/ui/styles.css`（実装当時299行）を実測すると、
font-sizeが18種（7px〜18px、0.5px刻みとrem混在）、gapが17種、paddingの宣言が36種、
control heightが13種、border-radiusは`--r`token があるのに`2px``3px``6px`が直値で併存していた。
z-indexは`2``3``4``10`が直値だった。

構造上の問題も4つあった。

1. `.btn`が12箇所で無効化されていた。素の`button {}`セレクタが外観を持つため、classの有無で
   結果が変わらない
2. 未完のリネームによる別名が二重定義されていた。`.hdr, .app-header` / `.key, .keycap` /
   `.panel, .side-panel` / `.status, .status-bar` / `.tab, .tabs button` /
   `.encslot, .encoder-key`など、15クラスがTSX側から一度も参照されていなかった
3. ADR 0013は「CSS Modules採用」と記録していたが、moduleは1つも実装されていなかった
4. Reactにcomponent層が無く、`<button className="btn primary">`のような組み合わせを
   13ファイルへ手で複製していた

さらに`.field label { font-size: 11px; color: var(--muted) }`が実際には一度もマッチしない
（`.field`自身が`<label>`で、子孫labelが存在しない）など、実装済みのCSSに既知の不整合があった。

## 選択肢

導入範囲について。

1. color tokenのみ維持し、寸法は個別修正で都度対応する
2. 寸法・タイポグラフィをtoken化し、CSS側の規約を作る
3. token化に加え、Reactのcomponent primitive（Button、Panel等）まで抽出する

CSSのファイル構成について。

1. `src/ui/styles.css`を単一ファイルのまま拡張する
2. ADR 0013の記録通りCSS Modulesへ移行する
3. globalなCSSのまま`@layer`でcascadeを階層化する

## 決定

導入範囲は案3（token + React primitive）、CSS構成は案3（`@layer`による階層化。CSS Modulesは
採らない）を採る。**ADR 0013の「CSS Modules」条項をこのADRが上書きする。** ADR 0013の他の決定
（Vite + React + TypeScript、component libraryを使わない、外部state管理/router を足さない）は
変えない。

### Token層

`src/ui/styles/tokens/`に`color.css`（Issue #16の値をそのまま移設）、`dimension.css`
（space / density / radius / border-width / control-height / bar-height / panel-width /
focus-ring / z-index）、`typography.css`（font family / size 6段 / leading / weight）、
`motion.css`（duration / easing、`prefers-reduced-motion`対応）を置く。

font-sizeは18種を`--text-xs`〜`--text-xl`の6段へ、spaceは`--space-0`〜`--space-8`の
4px刻み（半段2px）へ集約する。keycapの`--cap-font` / `--cap-sub-font`は`scale.unit`からの
実行時計算のため、token化の対象から明示的に除外する（幾何由来の例外）。

### Cascade layer

```css
@layer reset, tokens, base, components, features, utilities;
```

`base`層は外観を持たない。`button`には`cursor: pointer`のような正規化だけを置き、色・境界線・
paddingなどの外観はすべて`components`層以降のclassへ移す。これにより`.btn`のようなclassが
実際に意味を持つようになる。命名はcomponentに`c-`、utilityに`u-`を前置し、状態は`is-*`とする。

### React primitive

`src/ui/components/ui/`に`Button` `Chip` `Tag` `Field` `Section` `Panel` `Callout`を置く。
class名の語彙を知る場所をここへ集約し、13個のfeature componentと`main.tsx`をこれらへ
migrateする。menu / dropdown / icon libraryは追加しない（ADR 0013がLucideの導入を
1つ目の使用時まで保留しているため、この作業では要らない）。

### 機械検証

`src/ui/design-system.test.ts`を`theme.test.ts`と同じ形式で追加する。`styles/components/`と
`styles/features/`に生のpx / remを禁止し（token fileと、盤面・pickerのgeometry由来の
`calc()` `min()` `100vh` `50%`などは許可リスト化する）、raw hexを`tokens/color.css`だけに
限定し、`!important`を禁止し、CSSのclass selectorがTSX側かkeycodeClass()の返り値一覧に
存在することを検証する。最後の検証が、今回発見した15クラスの死亡を再発させない仕組みになる。

## 理由

- 案1（現状維持）は、今回発見した問題（`.btn`の無効化、15個の死にクラス、壊れた`.field label`）を
  再発防止する仕組みを持たない。同じ種類の乖離が今後も蓄積する
- 案2（CSS Modulesへ実際に移行）は、ADR 0013の記録を実装と一致させる点では正しいが、
  `keycodeClass()`が返す動的クラス名と、`.mini-board .key .m`のような画面をまたぐセレクタの
  作り直しが要る。今回の目的はtoken・命名規約・primitiveの導入であり、module境界の再設計は
  別の判断として切り離す方が対象が明確になる
- `@layer`は、component libraryを増やさずに「後から書いたCSSが勝つ」現状の問題（`.btn`の
  無効化はまさにこれ）をcascadeの順序で解決する。追加の依存もビルド設定の変更も要らない
- React primitiveまで踏み込むのは、13ファイルへ手で複製された`className="btn primary"`の
  ような組み合わせが、class名の語彙をコードの複数箇所へ分散させているため。primitiveを
  唯一の場所にすると、その場所だけをtoken・命名規約に追従させればよくなる
- `theme.test.ts`と同型の機械検証を選んだのは、色層で実際に機能している前例をそのまま
  寸法層へ適用できるため。新しい検証の仕組みを増やさない

## 影響

- `styles.css`と`tokens.css`は削除され、`src/ui/styles/index.css`が唯一の入口になる。
  `main.tsx`のimport先が変わる
- `theme.test.ts`の`TOKEN_PATH`が`styles/tokens/color.css`を指すよう変わる。color tokenの値・
  contrast比・sampled paletteの検証内容自体は変えない
- feature層のCSS class名（`.overview-*` `.pk-*`など）は維持し、churnを避ける。改名するのは
  `.m` / `.s`（`.keycap-main` / `.keycap-sub`）のみで、keycap描画3箇所に閉じている
- 素の`<button>`に外観を依存していた`.pk` `.key` `.tab` `.sev` `.picker-target button`
  `.layer-tabs button` `.overview-layer-name`は、`base`層が外観を失うのと同じcommit内で
  明示的な外観指定へ移す必要がある
- `input` `select` `textarea`の外観は、bare element selectorのまま`components`層に残す。
  Behaviors / References / WorkspaceRecoveryは素の`<input>` `<label>` `<fieldset>`を使う
  「componentへ分割される前のlegacy面」（既存CSSのコメントの通り）であり、今回の対象範囲外
  とする。これらをclass主導の構造へ書き換えるのは別の判断とする
