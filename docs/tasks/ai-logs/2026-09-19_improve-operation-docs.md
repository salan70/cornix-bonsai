# 運用ドキュメントの見やすさ・簡潔さ改善

## Fact

- 利用者ガイド（`docs/user-guide/`）と README に不要な改行が多かった。
- 和欧空白の不足や文長超過が多数存在していた。
- 手順や判断基準が散文で書かれ、視認性に課題があった。
- 図解を最小限にし、文章規範と表・リストで構造化する方針が承認された。

## Decision

- 利用者ガイド 6 文書、ルート README、`docs/README.md` を改訂した。
- `concise-writing` に従い、1 文 1 行、和欧空白、50 字以下を適用した。
- 表や手順番号を導入し、視認性を高めた。
- `cli.md`: コマンド一覧表を新設し、書式を統一した。Mac 向けを明確に分離した。
- `troubleshooting.md`: 逆引き表を新設し、原因と手順を分離した。
- `safe-apply.md`: 安全原則、確認手順、判断表を構造化した。
- `web-ui.md`: 操作表を整理し、各タブ機能と競合解決を明確化した。
- `workspace-and-terms.md`: 用語表、ファイル表、正本方針を整理した。
- `README.md`: 利用者導入と開発運用コマンド表を分離した。
- `docs/README.md`: 分類表、正本規則、参照案内を整理した。
- 実機の安全ルール（Read-only、確認必須、検証照合）はすべて維持した。

## Validation

- `check-prose.sh`: 改訂対象 8 文書で警告 0 件。
- `just lint-md`: 105 ファイル検査、エラー 0 件。
- `just lint`: pre-commit 全検査 Passed。
- `just test`: 310 tests passed。
- `just docbridge-check`: 0 errors, 0 warnings。

## DocBridge Sync判断

- 今回の変更は `docs/user-guide/` と README 関連のみである。
- `docs/specs/` 配下の仕様やコードは変更していない。
- 管理対象外の改訂のため、リンクへの影響はない。
