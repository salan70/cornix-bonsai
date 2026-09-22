# Cornix design system iteration 2

## 目的

uiux-numaの比較実験から選んだ`chromatic-rail`をCornix Bonsai本体の全UI surfaceへ適用し、10配色とlight / darkを利用者が切り替えられる状態にする。

## 実施

- `uiux-numa@e15bc21`のsemantic color scheme 10種、LINE Seed JP、space / radius / motion tokenをCornixへvendoringした。
- `data-theme`と`data-scheme`を独立に管理し、localStorageへthemeとschemeを別キーで保存するAPIを追加した。
- headerの配色selectへ10種を接続し、既存のtheme select、workspace、WebHID、Applyの導線を維持した。
- header、編集対象、left rail、content、statusへ画面を再配置し、盤面、picker、side panel、modalをsemantic roleへ接続した。
- 狭いviewportではleft railを横tabへ切り替え、既存の編集コンポーネントを変更せず操作構造を保った。

## 判断

`chromatic-rail`を採用し、`layer-stage`と`editorial-console`は不採用とした。
採用理由と却下理由はADR 0029へ残した。

## 検証

`nix develop -c just test`、`nix develop -c just typecheck`、`nix develop -c just build`を実行した。
10配色のsemantic roleと主要コントラスト、raw hexの定義元、CSS token参照、class selectorの整合を自動テストで確認した。
1280x800の未選択workspace画面でchromatic-railのheader、left rail、empty state、statusを目視確認した。
