# 作業ログ: keycode pickerとキーラベル表示の安定化

## 依頼

keycode pickerのnavigation / numpad配置、encoderと適用先slotの寸法、Shift・Holdラベル表示を安定化する。

## 実施

- pickerを26u固定座標へ変更し、main / navigation / numpadの開始位置を`0 / 18 / 22u`へ固定した
- encoder slotと適用先ボタンを固定寸法・ellipsis・title表示へ変更した
- `LSFT` / `RSFT`の結果文字表示、複合Shiftの従来表示、Hold補助表示の文言削除とaccent色を実装した
- ADR 0017とUI仕様を追加・更新し、表示規則をDocBridge対象の仕様へ反映した

## 検証

- `nix develop -c just test`
- `nix develop -c pnpm typecheck`
- `nix develop -c just lint`
- `nix develop -c just docbridge-check`
- `nix develop -c pnpm build`
- Browserで1280px / 1024pxのpicker境界、固定slot、Shift・Hold表示を確認する

実機へのwrite・flash・bootloader操作とpushは行わない。
