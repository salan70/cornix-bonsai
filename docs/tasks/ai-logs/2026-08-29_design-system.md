# デザインシステムの設計と導入

## 目的

`src/ui/tokens.css`（Issue #16）でcolor tokenは完成していたが、寸法・タイポグラフィには
規約が無く、`src/ui/styles.css`のfont-sizeが18種・gapが17種・control heightが13種に
散在していた。`.btn`のようなclassが素の`button {}`セレクタに無効化され、`.hdr`/`.app-header`
のような未完リネームの別名が15個TSXから一度も参照されずに残っていた。`.field label`は
子孫に存在せず一度もマッチしていなかった。これらをtoken化・cascade layer・React primitiveで
再設計し、`theme.test.ts`と同型の機械検証で規約からの逸脱を継続的に検出できるようにした。

## 判断

- 寸法・タイポグラフィ・motionをcolorと同じ構成で`styles/tokens/`へtoken化する
  （ADR 0021。ADR 0013の「CSS Modules」条項を上書きし、他の決定は維持）
- CSSは`@layer reset, tokens, base, components, features, utilities`で階層化する。
  `base`は外観を持たず、外観はすべて`components` / `features`層のclassへ限定する
- 素の`<button>`に外観を依存していた`.pk` `.key` `.tab` `.sev` `.picker-target button`
  `.layer-tabs button` `.overview-layer-name`のうち、実際に生きていたものだけ自前の外観を
  持たせ、`.tab`と`.layer-tabs`は死んでいたため削除する
- React primitive（Button / Chip / Tag / Field / Section / Panel / Callout）を
  `src/ui/components/ui/`へ導入し、class名の語彙を1箇所へ集約する。menu / dropdown /
  icon libraryは追加しない
- Behaviors / References / WorkspaceRecoveryの素の`<input>` `<label>` `<fieldset>`は
  legacy面として対象外にする。`input` `select` `textarea`の外観は要素セレクタのまま
  `components`層に残す
- 視覚階層も合わせて整える。headerを接続操作・file操作・backup復元・テーマ選択へ分け、
  稀な復旧操作である「backup から復元」をsecondary（青）からghostへ降格する。focus ringを
  outline+box-shadowの二重リングから単層（`--focus-ring-width` / `--focus-ring-offset`）へ
  簡略化しつつ、dark themeの3:1 contrastは`--focus-ring`token（light: `--focus`、
  dark: `--focus-outer`）で維持する

## 変更

- `src/ui/styles/`を`reset.css` / `base.css` / `tokens/*.css` / `components/*.css`
  / `features/*.css` / `utilities.css` / `index.css`へ再構成し、旧`styles.css`・
  `tokens.css`を削除した
- 直値をすべてtoken化した。既存のtoken scaleに乗らない値（encoder slot幅、modal幅など）は
  `dimension.css`へ専用tokenとして追加し、`geometric`という印だけで押し通さなかった
- `.m`/`.s`を`.keycap-main`/`.keycap-sub`へ、`on`/`sel`/`done`/`now`/`pending`/`zero`
  のような裸のmodifierを`is-*`へ改名した
- `Button` `Chip` `Tag` `Field` `Section` `Panel` `Callout`を追加し、13 componentと
  `main.tsx`を移行した。`Field`はlabel textを`<span class="c-field-label">`へ常に束ね、
  構造的に`.field label`の不整合を解消した
- `src/ui/design-system.test.ts`を追加し、raw px/rem、raw hexの範囲外出現、token参照の
  実在性、`!important`、死んだclass selectorを検証する
- `docs/decisions/0021-design-system.md`と`docs/specs/design-system.md`を追加し、
  `docs/specs/ui.md`から参照した

## 検証

- `nix develop -c just lint`: oxlint、oxfmt、markdownlint、typecheck、DocBridgeが成功。
- `nix develop -c pnpm test`: 187 tests passed（`theme.test.ts`のsampled palette・
  contrastは1件も変更していない）。
- `nix develop -c pnpm build`: Vite production buildが成功。
- CLIの`import vil`で`fixtures/cornix-lp/baseline.vil`から実workspaceを作成し、
  OPFS（`navigator.storage.getDirectory()`）とIndexedDBへ注入して`restoreWorkspace()`
  経由でbrowserへ読み込ませた。Keymap（盤面・side panel・keycode picker）、Overview
  （layer grid・Tap Danceサイドバー）、Behaviors、References、診断panelをlight・dark
  双方で目視確認した。header階層・Fieldのlabel表示・status bar dividerも確認した。
  consoleのwarning / errorは0件
- ApplyDialogは実機接続が要るため、この環境では目視確認できていない。CSSは他の画面と
  同じtoken・primitiveパターンで書いており、design-system.test.tsの検証は通っている

## DocBridge Sync判断

related gateは`docs/specs/ui.md`の既存44 counterpartのうち、`Behaviors` / `References` /
`WorkspaceRecovery` / `browser-export` / `browser-files`のcounterpart未更新を報告した。
`Behaviors`・`References`・`WorkspaceRecovery`は`Panel` / `Button` primitiveへの
wrapping変更のみで、ui.mdが契約として書いているTap Dance/Combo/Settingsの直接編集、
usages/unusedの一覧、3種の復旧フローの挙動はいずれも変えていないため、counterpart更新は
不要と判断した。`browser-export` / `browser-files`は今回のcommitに触れていない。
