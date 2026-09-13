# 適応ルール

同期前に実体から判断し、検出できない値だけユーザーへ確認する。

## 作業ログ

1. `docs/tasks/ai-logs/`があればそのまま使う。
2. `ai-logs/`があれば`ai-logs/YYYY-MM-DD_{slug}.md`へ置換する。
3. どちらもなければ`docs/ai-logs/YYYY-MM-DD_{slug}.md`を提案する。

## ブランチ戦略

`git-operations/SKILL.md`の`BRANCH_STRATEGY_START`から`BRANCH_STRATEGY_END`までを次のいずれかへ置換する。

- main直接コミット可: `variants/direct.md`
- Issueベースでfeature branch必須: `variants/feature-branch.md`

既存のAGENTS、Git運用文書、remote設定で確定できない場合だけ質問する。

## 検証環境

- `flake.nix`があればNix経由を優先する。
- mise、devbox、package manager、Makefile、justfileがあれば、プロジェクトが定義するcommandを使う。
- pin留め環境がない場合はSkill本文を変更せず、host toolのpathとversionを確認する。

## Claude/Codex共通化

Codex併用時は`AGENTS.md -> CLAUDE.md`と`.agents/skills -> ../.claude/skills`を使う。既存実体を自動削除・上書きしない。

## 変更しないもの

- Skill frontmatter
- 正本にないローカルSkill
- プロジェクト固有のCLAUDE.md section
- ユーザー設定、hooks、MCP、plugin設定
