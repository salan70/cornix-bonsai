# Design System

寸法・タイポグラフィのtoken、CSSのcascade layer構成、React primitiveの契約を定義する。
色tokenの契約は[ui.md](./ui.md#light--dark-theme)に残す。DocBridgeはTypeScriptの`export`宣言だけを
symbol単位でlinkできるため、`styles/`配下のCSS token fileはfile単位のlink対象にできない。この節は
それらのファイルへの直接linkを持たず、パスをprose内に記す。

## Token

space、radius、border-width、control-height、bar-height、panel-width、focus-ring、z-indexは
`styles/tokens/dimension.css`、font family / size / leading / weightは
`styles/tokens/typography.css`、duration / easingは`styles/tokens/motion.css`に置く。

- spaceは`--space-0`〜`--space-8`の4px刻み（`--space-1`のみ2pxの半段）
- font-sizeは`--text-xs`（10px）〜`--text-xl`（18px）の6段
- radiusは`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-full`の4段
- motionは`prefers-reduced-motion: reduce`で`--duration-*`を0msへ落とす

### 幾何由来の例外

盤面とkeycode pickerは実行時に幅を実測して倍率を決めるため、token化の対象から外れる。

- keycapの`--cap-font` / `--cap-sub-font`は`useBoardScale`が返す`scale.unit`から算出する
  （[ui.md](./ui.md#keymap-editor)）
- `.picker`の`--pk`はcontainer queryの`100cqw`から、`.overview-grid`の
  `grid-template-columns`は`overviewColumns()`の結果から、それぞれJS/CSSの計算式で決まる

これらの宣言は`design-system.test.ts`の直値検出から明示的に除外する。

## Cascade layer

```css
@layer reset, tokens, base, components, features, utilities;
```

- `reset`: box-sizing、bodyのmarginなど、外観を持たない最小限の正規化
- `tokens`: `styles/tokens/*.css`の`:root`宣言
- `base`: 要素セレクタへの正規化のみ。`button`は`cursor: pointer`など状態だけを持ち、
  色・境界線・paddingは持たない。`input` / `select` / `textarea`は例外で、要素セレクタのまま
  外観を持つ（下記「legacy面」を参照）
- `components`: `c-`接頭辞のclass。Button、Chip、Tag、Field、Section、Panel、Calloutなど
  再利用可能な部品の外観
- `features`: 画面固有のclass（`.keymap-layout` `.overview-*` `.pk-*`など）。既存の命名を
  維持し、リネームはしない
- `utilities`: `u-`接頭辞の1属性class（`u-text-sm`、`u-muted`など）

`base`が外観を持たないため、素の`<button>`に依存する箇所は明示的な外観classが必須になる。
`.pk` `.key` `.tab` `.sev` `.picker-target button` `.layer-tabs button`
`.overview-layer-name`はいずれも自前で外観を定義しており、`base`の正規化（`cursor` /
`font: inherit`）だけを共有する。

### legacy面

Behaviors、References、WorkspaceRecoveryの一部（`<input>` `<label>` `<fieldset>` `<ul>`）は
componentへ分割される前の面として素の要素へ依存し続ける。`input` `select` `textarea`の外観は
`components`層で要素セレクタのまま定義し、この面を壊さない。新しい編集UIをこれらの画面に足す
場合は、React primitiveへ移行してから追加する。

<!-- @code src/ui/components/ui/index.ts#Button -->
<!-- @code src/ui/components/ui/index.ts#Chip -->
<!-- @code src/ui/components/ui/index.ts#Tag -->
<!-- @code src/ui/components/ui/index.ts#Field -->
<!-- @code src/ui/components/ui/index.ts#Section -->
<!-- @code src/ui/components/ui/index.ts#Panel -->
<!-- @code src/ui/components/ui/index.ts#Callout -->
<!-- @code src/ui/components/ui/index.ts#CalloutLabel -->

## React primitive

`src/ui/components/ui/`に置く。class名の語彙を知る場所をここへ集約し、feature component側は
primitiveのpropsだけを扱う。

| primitive                  | props                                                                                                       | 用途                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                   | `variant`: `neutral` / `primary` / `secondary` / `ghost`                                                    | header、status bar、modal footerの操作                                                                                                       |
| `Chip`                     | `as`（`span` / `button`）、`selected`、`connected`、`faint`、`dot`                                          | 接続状態、layer選択                                                                                                                          |
| `Tag`                      | `variant`: `neutral` / `add` / `change` / `remove`                                                          | diffのadd/change/remove表示                                                                                                                  |
| `Field`                    | `label`、`as`（`div` / `label`）                                                                            | labelと入力を1組で扱う。label textを常に`<span class="c-field-label">`へ束ね、`.field label`が子孫に存在せず不達だった不整合を構造で解消する |
| `Section`                  | —                                                                                                           | side panelの区切りブロック（旧`.psec`）                                                                                                      |
| `Panel`                    | `as`（`aside` / `section`）、`wide`                                                                         | side panel全般                                                                                                                               |
| `Callout` / `CalloutLabel` | `as`（`div` / `section` / `button` / `label`）、`tone`: `neutral` / `warning` / `error` / `info`、`pushEnd` | 診断・banner・acknowledge行                                                                                                                  |

`Callout`は`success` toneを持たない。`.row--success`（Apply前backupの確認行）は診断や
bannerとは別の文脈で、汎用行`.row`のmodifierとして`features/apply.css`に残す。

menu / dropdown / icon libraryはこの作業では追加しない。

## 機械検証

`src/ui/design-system.test.ts`が以下を検証する。

- `styles/components/**`と`styles/features/**`は、token fileと幾何由来の許可リストを除いて
  生のpx / remを含まない
- raw hex（`#rrggbb`等）は`styles/tokens/color.css`にしか出現しない
- `--space-*` / `--text-*` / `--radius-*`などtoken参照はすべて実在するtoken名を指す
- CSSのどこにも`!important`が出現しない
- CSSのclass selectorはTSX側のリテラル、または`keycodeClass()`が返す値
  （`mod` `mod-tap` `layer` `layer-tap` `tapdance` `custom` `none` `basic`）のいずれかに
  対応する。対応しないclassは死んだ別名として扱う
