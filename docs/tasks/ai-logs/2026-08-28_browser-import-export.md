# 2026-08-28 Browser import / export

対象: Issue #15（I-004）の`.vil` import、VIL / SVG / PDF export

## Fact

- 既存UIのVIL importとSVG/PDF exportは未接続で、Overviewのボタンはdisabledだった。
- `.vil`読込をファイル選択 → `parseVil` → 現在workspaceのdesired state保存へ接続した。
- VIL書出、選択layerのSVG/PDF書出を`cornix/generated/`へ接続した。
- exportは既存の`serializeVil` / `renderSvg` / `renderPdf`を使い、実機write経路を呼ばない。
- File System Access APIのファイル選択を使い、非対応browserでは`input[type=file]`へfallbackする。
- browser adapterのround-trip / renderer smoke testを追加した。
- 既存fixtureで全168テスト、typecheck、build、lint（DocBridge含む）が通過した。
- in-app browserの未選択画面で、VIL読込・VIL書出はworkspace未選択時disabled、Overviewのexport導線はworkspace選択後に有効化される構造を確認した。

## Decision

- browser exportの保存先は既存のGit管理外`cornix/generated/`とする（ADR 0019）。
- `.vil` importはdefinition bindingを変更せず、UID不一致などは通常のvalidation / Apply gateで止める。
- Issue #15のbrowser実workspaceでのファイル選択・生成物確認は、次の手動受入で実施する。

## Open Question

- Chromeで実workspaceを開き、`.vil`読込後の`keymap.yaml`反映と、生成された3 artifactの内容を目視確認する。
- IssueへのGitHubコメント・close・pushは別途明示承認が必要であり、今回は実施していない。
