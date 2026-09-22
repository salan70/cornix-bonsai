# uiux-numaのchromatic-railをCornixの本体UIへ採用する

状態: 採用

2026-09-22に、Cornix Bonsaiの画面全体へuiux-numaのデザインシステムを適用し、比較実験で選んだchromatic-railを本体の既存編集フローへ移植する判断を決めた。

## 背景

既存UIは画面ごとにsurface、button、themeの見た目が分かれ、配色を変えるにはfeature CSSを個別に修正する必要があった。
uiux-numaの`experiments/cornix-product-ui`で3方向を同じ情報設計に載せ、`chromatic-rail`がCornixの盤面編集、side panel、status導線を最も強く整理できると確認した。

## 選択肢

1. `chromatic-rail`を既存のReact構造へCSSとtokenで移植する
2. `layer-stage`を採用し、盤面中心の奥行き表現を主構造にする
3. `editorial-console`を採用し、文書編集の密度を主構造にする
4. 実験の見た目を採用せず、既存の画面単位で調整する

## 決定

案1を採る。

uiux-numaのdesign tokenを`e15bc21`からvendoringし、10配色を`data-scheme`で切り替えられるようにする。
`data-theme`のlight / dark、localStorageのtheme選択、既存のCornix core、WebHID、Applyの責務は維持する。
本体のレイアウトはheader、編集対象、左rail、content、statusの5面へ再配置し、盤面、picker、side panel、status、modalの全surfaceをsemantic roleへ接続する。

## 理由

`chromatic-rail`は選択中のtabを左railの強い塗り面で示し、盤面とside panelを同じcontent領域へ置くため、現在位置と編集対象の関係が一目で分かる。
`layer-stage`は盤面の奥行きを強調するが、Cornixでは盤面内の状態と診断を優先するため採らない。
`editorial-console`は情報密度を上げられるが、実機Applyと編集対象の切り替えが一般的な文書ツールの比喩に寄りすぎるため採らない。
画面単位の個別調整は10配色とlight / darkの組合せでvariant driftを起こすため採らない。

## 影響

- `src/ui/styles/tokens/schemes/`が配色の値の正本となり、`color.css`はCornix既存名への互換aliasだけを持つ。
- LINE Seed JPをfont-faceとして同梱し、font loading中は既存の日本語sans fallbackへ戻る。
- 配色選択はブラウザlocalStorageだけへ保存し、workspaceやkeymap YAMLの内容を変更しない。
- 左railは狭いviewportでは上段の横スクロールtabへ切り替える。
- CSSのraw hexとgeometry由来の計算値は設計システムテストで定義元を限定する。
- uiux-numa側の実験は比較と根拠を残すため維持し、本体側では採用したchromatic-railだけを継続実装する。

## 却下理由

- `layer-stage`: レイヤーの視覚的奥行きがkeymapの実際の参照関係を代替し、診断の可視性を下げる。
- `editorial-console`: denseな情報面はReferencesやBehaviorsには有効だが、盤面編集の主操作としては優先順位が逆になる。
- 既存styleの局所修正: paletteとsurfaceの責務がfeatureへ再分散し、scheme追加時の検証範囲が増える。
