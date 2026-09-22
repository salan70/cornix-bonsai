# chromatic-rail 本体移植

## Fact

- uiux-numaのIssue #15で`chromatic-rail`が採用された
- 本体には保存状態、保存競合、対象別の再読み込み導線がすでに実装されていた
- 本体の対象モデルはCornix LPとMac ANSI / JISで、実験案のトップレベル項目とは異なる
- 本移植では実機への書き込みとOS設定の変更を行わない

## Inference

- 実験案のDOMをそのまま移植すると、実アプリの対象選択と既存タブの責務が重複する
- 左レールは対象選択とタブを一つの編集ナビゲーションとして見せるのが適切である
- headerの補助操作をdetailsへまとめても、disabled条件と操作経路は維持できる

## Decision

- `AppHeader`の主操作をworkspaceに絞り、接続・VIL・再読込・backup復元を補助メニューへまとめる
- `EditTargetSelect`と既存タブを左レールへ移し、狭い画面では横方向へ切り替える
- 本文とstatus barの既存コンポーネント、保存状態表示、Apply導線を維持する
- 設計判断をADR 0029へ記録する

## Verification

- `nix develop -c just typecheck`
- `nix develop -c just test`
- `nix develop -c just build`
- `nix develop -c just docbridge-check`
- `nix develop -c just lint`
