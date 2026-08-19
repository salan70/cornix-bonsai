# frontendはVite + Reactを土台に、CSS Modulesだけで組みlibrary・router・state管理を足さない

状態: 採用

2026-08-19に、ADR 0011のwireframeが必要とするUIの範囲を確認して決めた。
今回は選定の記録だけで、依存の追加もscaffoldも行っていない。実機操作も行っていない。

## 背景

リポジトリにはfrontendが1行も無い。`package.json`の依存はTypeScriptと`@types/node`だけで、
`src/`は`src/core/`のみ、`.tsx` / `.css`は存在しない。

ADR 0011でUIの範囲が確定した。必要なのはheader、tab、絶対配置のkey grid、side panel、
診断リスト、線形のmodal、mini boardのgridである。

制約は以下。

- `src/core/`はReact・filesystem・WebHIDのいずれにも依存しない（ADR 0006）
- 唯一のmutable stateは`VilDocument`で、編集は純関数が新しいrawを返す（ADR 0006）
- 対象browserはChromium系に確定している（ADR 0004 / 0007）
- keyの座標はdefinitionから実行時に計算する（ADR 0002 / 0011）
- ADR 0006はmemo化を「UIが来るまで最適化しない」として先送りしている

## 選択肢

CSSについて。

1. plain CSSとCSS Modules（Viteの標準機能だけ）
2. Tailwind CSS
3. CSS-in-JS

state管理について。

1. React標準（`useState` / `useReducer` + Context 1つ）
2. 外部store（Zustand / Jotai等）

## 決定

| 項目              | 決定                                                         |
| ----------------- | ------------------------------------------------------------ |
| build / framework | Vite + React + TypeScript                                    |
| CSS               | plain CSSとCSS Modules。tokenはCSS custom properties         |
| component library | 使わない。dialogは`<dialog>`                                 |
| icon              | Lucide（`lucide-react`）。MVPで使うiconは10個以内に絞る      |
| state管理         | React標準（`useState` / `useReducer` + Context 1つ）で始める |
| router            | 使わない。4 tabはstateで持つ                                 |
| ディレクトリ      | `src/core/`はReact非依存を維持し、`src/ui/`を足す            |
| tsconfig          | core（DOM lib無し）とui（DOM + JSX）へ分割する               |

- CSS tokenはADR 0011のvisual directionをそのまま`:root`のcustom propertyへ落とし、
  darkは`prefers-color-scheme`のmedia queryでtokenだけ差し替える
- `src/ui/`から`src/core/`への依存は許し、逆向きは禁止する。tsconfigの分割でこれを型で保つ
- Lucideを入れるのはicon 1つ目を実際に使う時点とし、それまで依存を足さない

## 理由

- CSSでlibraryを足さない。keyの座標は実行時計算でinline styleになるため、utility classが
  効く範囲がそもそも狭い。tokenの数はADR 0011の範囲では20程度で、Viteの標準機能で足りる。
  Tailwindはビルド設定とclass名の語彙を増やす一方、この画面で節約できる記述が少ない
- component libraryを使わない。必要な部品はkey grid・panel・modal・リストだけで、
  どれもlibraryが強い領域ではない。逆にlibraryのdesign言語（影・大きめのradius・
  独自のspacing scale）がADR 0011の「装飾より可読性」と正面から衝突する
- state管理を足さない。外部storeが解くのは正規化された大きなstateと部分購読の問題だが、
  ここにあるmutable stateは`VilDocument` 1つで、編集は純関数が新しいrawを返す（ADR 0006）。
  解くべき問題がまだ発生していない。再描画が実測で問題になったら`useSyncExternalStore`で
  切り出す余地は残る
- routerを足さない。URLを共有する相手がいないlocal toolで、deep linkの要求が無い。
  tabの選択をURLへ載せると、reloadでworkspaceの再選択が要る状態と噛み合わない
- Reactを前提にするのはNotionの技術構成として既に置かれているためで、ここで覆さない

## 影響

- CSS Modulesを選んだため、共通tokenの定義元が1ファイル（`src/ui/tokens.css`相当）になる。
  ADR 0011のvisual directionとこのファイルが二重管理にならないよう、ADR側は方針だけを持ち、
  具体的な値はコード側を正とする
- state管理を足さないため、`VilDocument`全体が1つのstateとして更新される。
  10 layer × 50キーの盤面がキー1つの編集で再描画される。ADR 0006が先送りした
  memo化の判断が、実測でここに戻ってくる
- tsconfigを分割するため、`pnpm typecheck`は2つのprojectを見ることになる。
  CIの`typecheck.yml`とpre-commitの`pnpm typecheck`を両方に届かせる必要がある
- Viteを入れる時点でdevDependenciesが一気に増える。`.gitignore`は既に`dist/`と`.vite/`を
  無視しているので、そこは追加不要
- `<dialog>`を使うため、modalのfocus trapとEscの挙動はbrowser任せになる。
  Apply中に閉じさせない要件（ADR 0011）は`<dialog>`のcancel eventを止めて実現する
- browserで動くxz decoderの選定（ADR 0007のOpen Question）はここでも決めていない。
  依存の追加はfrontend実装時に別途判断する
