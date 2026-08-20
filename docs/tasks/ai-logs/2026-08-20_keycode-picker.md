# 作業ログ: ISO/JIS keycode picker

## 依頼

盤面下へISO/JISの物理配列keycode pickerを追加し、キー全体・Tap・Holdを切り替えて
キーまたはencoderへ割り当てられるようにする。

## 実施

- `ISO_JIS_ROWS`にfunction、文字、JIS固有キー、nav、numpad、shift済み記号の配列を追加した
- `applyPick`、`canPick`、`composeKeycode`をUIの純粋TypeScriptへ分離した
- modifier / mod-tap / layer-tapのwrapperとlayer actionを保持するようcomposeを修正した
- pickerをKeymap tabのencoder帯の下へ常設し、未選択時は操作を無効化した
- KeyPanelのTap / Hold selectを現在値と適用先トグルへ置き換えた
- UI仕様、ADR 0014、テストを追加した

## 検証

- `nix develop -c just lint`: 成功
- `nix develop -c just test`: 141 tests passed
- `nix develop -c pnpm build`: 成功
- `nix develop -c just docbridge-check`: 0 errors / 0 warnings

実機へのwrite・flash・bootloader操作は行っていない。
