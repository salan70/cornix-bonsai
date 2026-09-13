---
name: syncing-ai-assets
description: ai-assets 正本の catalog に登録された共通 Skill をプロジェクトへ同期し、CLAUDE.md と Claude/Codex 共通 symlink を更新するときに使う。
---

# AI資産の同期

対象プロジェクトで実行し、正本から`.claude/skills`へ冪等に同期する。dotfiles側から対象プロジェクトを直接変更しない。

## 正本

- Skill: `~/Projects/tool/dotfiles/ai-assets/skills/`
- catalog: `~/Projects/tool/dotfiles/ai-assets/skills/skill-catalog.yaml`
- registry: `~/Projects/tool/dotfiles/ai-assets/registry/project-registry.yaml`
- 適応規則: [references/adaptation-rules.md](references/adaptation-rules.md)

catalog に登録された Skill はすべて `core` として同期する。正本にないローカル Skill は変更しない。

## 手順

1. 対象リポジトリのroot、既存`CLAUDE.md`、`AGENTS.md`、`.claude/skills`、`.agents/skills`、Git規約、検証commandを調査する。
2. 適応するブランチ戦略と作業ログパスを確定する。
3. Skillごとの追加・更新、CLAUDE.md差分、symlink操作、orphaned候補を提示する。
4. ユーザー承認後、catalog の Skill を `.claude/skills` へコピーする。適応規則も適用する。
5. CLAUDE.mdの指定sectionと、必要なClaude/Codex共通symlinkを更新する。
6. digestを計算し、schema v2のregistryを更新する。
7. frontmatter、相対link、symlink、Git差分を検証して報告する。

## CLAUDE.md

templateの次のsectionだけを追加または上書きする。

- `## スキル`
- `## 文章規範`
- `## 作業ログ規約`

`## 完了報告フォーマット（必須）` は廃止した。生成せず、対象に残っていれば手順 3 の差分に削除として含め、承認後に削除する。

`プロジェクト概要`、`クイックリファレンス`、設計・検証規約、ユーザー追加sectionは変更しない。

## Codex併用

ユーザーがCodex併用を明示した場合、または`AGENTS.md`、`.agents`、`.codex`のいずれかが既にある場合は、次を作成する。

```text
AGENTS.md -> CLAUDE.md
.agents/skills -> ../.claude/skills
```

- 期待どおりのsymlinkはそのままにする。
- パスが存在しない場合だけ相対symlinkを作る。
- 通常ファイル、実体directory、異なるsymlinkがある場合は上書きせず、移行対象として報告する。
- `.claude/settings.json`、`.codex/config.toml`などのユーザー・runtime設定は同期しない。

## Registry

各Skill directoryの全ファイルをpath順に連結し、sha256を`sha256:<hex>`で記録する。

- `intent`: `deployed`、`excluded`、`local`の人間判断を保持する。
- `state`: `in-sync`、`local-modified`、`source-ahead`、`both`、`orphaned`を実体から再計算する。
- `source_commit`と`last_scanned`を更新する。
- registryがv2でなければ変換せず、dotfiles側での移行が必要と報告する。

orphaned Skillは自動削除しない。
