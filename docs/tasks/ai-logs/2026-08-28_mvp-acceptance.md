# 2026-08-28 MVP実機・手動受入

対象: Issue #13 / #14 / #15（I-002 / I-003 / I-004）

## Fact

- 固定Nix環境で開発サーバーを起動し、ChromeでCornix Bonsaiを操作した。
- Desktop上の`Cornix Acceptance/USB Baseline`を実機USBのfull readで初期化した。
- USBでdisconnectするとUIが`未接続`になり、再接続操作でCornixを再取得できた。
- BLEでも`Cornix Acceptance/BLE Baseline`をfull readで初期化した。
- USB/BLEのexport結果はUID `16882930253541522617`が一致し、VIL bytesも一致した。
- USB/BLEのCLI semantic diffは`changedCount: 0`だった。
- `KC_A`を`KC_B`へ変更し、1件のApplyを実行して即時reread verifyとdiff 0件を確認した。
- 電源再投入後に再readし、元の`KC_A`へ復元した。backup復元後のdesiredも`KC_A`へ戻した。
- Apply確認中の切断でdeviceが未接続になり、Apply計画が破棄されることを手動確認した。
- 外部変更テストでは`keymap.yaml`への外部コメント追加後のUI保存が競合として拒否され、ファイルを上書きしなかった。
- `KC_A`を`KC_B`へ変更して保存・Applyし、復元後に`KC_A`へ戻した。3文字連続入力の専用確認は今回の記録に含めていない。
- 実機workspaceのCLI validationはUSB/BLEともerror 0、warning 0、information 5だった。

## CLI検証

- fixture `.vil` importからworkspaceを生成した。
- `validate` / `analyze`を実行し、error 0、warning 0を確認した。
- fixtureを基準に`diff`し、`changedCount: 0`を確認した。
- SVG / PDFを生成した。
- VIL exportはfixtureとbyte一致した。

## Decision

- Issue #14のUSB/BLE主要read・single-entry write/verify・reconnect acceptanceは完了と判断する。
- Issue #13/#15は、下記Open Questionの手動項目を確認するまでcloseしない。
- 実機writeはUI上の人間確認経由でのみ実施し、AI/CLIからは開始していない。
- `latest.vil`はApply直前のbackupであり、テスト前状態の比較には使用しない。テスト前backupは`2026-08-28T134604151Z.vil`である。

## Open Question

- 電源再投入後の値保持は、今回の実機ではテスト前状態へ戻ったため、flash durabilityの保証根拠にはしない。
- Issue #13の「3文字ぶん連続で編集して最後の入力を保存」は専用の受入記録が未取得である。
- Issue #15の`.vil` import・SVG/PDF exportはCLIで確認済みだが、browser workflowとしての専用受入記録は未取得である。
- IssueのGitHubコメント・close・pushは別途明示承認が必要であり、今回は実施していない。
