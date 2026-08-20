# 作業ログ: Vial準拠のkeycode labelsとISO/JIS picker

## 依頼

添付プランに基づき、keycode pickerと盤面keycapの表記をVialのISO/JIS面へ揃える。

## 実施

- shift済みkeycodeの対応表を`src/core/keycode/shifted.ts`へ切り出し、wire encodeと表示で共有した
- `src/ui/keycode-labels.ts`へ表示ロジックを移し、numpad・shift済み記号・JIS/ISO固有キーの刻印を追加した
- ISO/JIS pickerを6行16uのmain、逆T字navigation、4u numpad、独立26u記号ストリップへ更新した
- pickerのDOMをpitchベースへ変更し、コンテナ幅に応じてキーサイズを自動縮小するCSSへ更新した
- keycapの主ラベルを複数行へ対応し、shift併記とroleを合わせた3段表示を許容した
- ADR 0015、UI仕様、ADR 0011の更新、純粋関数テストを追加した

## 検証

- `nix develop -c just test`: 143件成功
- `nix develop -c pnpm typecheck`: 成功
- `nix develop -c just lint`: 成功
- `nix develop -c just docbridge-check`: 0 errors / 0 warnings
- `nix develop -c pnpm build`: 成功
- dev serverの初期画面はBrowserで確認した。`Workspaceを開く`はOSのFile System Access APIへ
  遷移するため、Browser操作だけでは`fixtures/cornix-lp`を注入できず、実データを開いたpickerの
  目視確認は未実施

実機へのwrite・flash・bootloader操作は行っていない。
