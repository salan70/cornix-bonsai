# Overview情報ダッシュボード化

## 目的

Overviewで参照layer、全キー・encoder、layer遷移、使用中Tap Danceを一望できるようにする。

## 実装判断

- baseline fixtureは10 layer・各50 key・各2 encoderで、layer 0〜4に遷移参照があり、5〜9は参照元が無い。
- 使用中判定は割り当て有無や既存reachabilityではなく、physical key・encoder・TapDance・Combo内のlayer操作参照とした。
- Overviewはlayer 0と参照layerを初期表示し、参照なしlayerはtoggleで展開する。
- layer名は既存の`cornix/labels.yaml` sidecarへ保存し、空文字は削除する。
- layer操作は色・L番号・名前で対応付け、hover/focus時だけSVG overlayの線を描く。
- Tap Danceは参照数が1以上のentryを読み取り専用で表示し、編集はBehaviorsへ残す。

## 変更内容

- `src/ui/overview-model.ts`に純粋なOverview表示モデルとlayer参照集計を追加。
- `src/ui/components/Overview.tsx`をlayer grid、encoder表示、inline layer名編集、Tap Dance sidebar、関係線へ再構成。
- `src/workspace/labels.ts`へlayer名更新関数を追加し、`main.tsx`の既存labels保存キューへ接続。
- Overview用CSS/token、unit test、ADR 0018、`docs/specs/ui.md`を更新。

## 検証

- `nix develop -c pnpm typecheck`: passed
- `nix develop -c pnpm test`: 167 tests passed
- `nix develop -c pnpm build`: passed
- `nix develop -c just docbridge-check`: 0 errors / 0 warnings
- `nix develop -c just lint`: oxlint、oxfmt、markdownlint、typecheck、DocBridge passed
- in-app browserのlocalhost初期画面は描画確認済み。`Workspace`後のfixture読み込みはFile System Access APIの
  chooser自動介入でできず、Overviewの1280×800実画面測定は未実施。unit testとbuildの結果とは分けて扱う。
