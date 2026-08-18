# AGENTS.md

このファイルは Codex が `.agents/` 配下の AI assets を扱う際のガイダンスを提供します。

## AI asset 運用

- この `.agents/` ディレクトリは Codex 用 assets の正本です。
- `.agents/skills/` は実体ディレクトリであり、`.claude/skills/` への symlink ではありません。
- Claude 側に skill を追加・更新した場合は `porting-ai-assets-to-codex` を使って Codex 側への移植要否を判断します。
- Claude 専用の手順を Codex 用 asset にそのまま転記しないでください。

## 作業ルール

- Codex 用 skill は `.agents/skills/` に配置します。
- `.codex/` は Codex 設定用であり、skill 置き場としては使いません。
- 依頼スコープ外の「ついでに改善」を禁止します。
