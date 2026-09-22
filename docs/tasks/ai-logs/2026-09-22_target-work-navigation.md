# Target + Work ナビゲーション

## Fact

- uiux-numaでTarget LibraryとChromatic Rail Nextを比較し、対象一覧を常時表示する組み合わせが選ばれた
- Cornixの既存編集対象はCornix LP、Mac ANSI、Mac JISである
- Macでは全体マップと動作定義を提供していない

## Decision

- `EditTargetSelect`を左レール内の対象カードへ変更する
- 対象カードの下へキー割り当て、全体マップ、動作定義、検証を固定配置する
- 利用できない作業は位置を維持して無効表示し、理由を補足する
- 対象変更で現在の作業が利用できなくなった場合はキー割り当てへ戻す

## Verification

- `just typecheck`
- `just build`
- `just docbridge-check`
- `just lint`
