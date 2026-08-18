---
name: syncing-ai-assets
description: 正本ソースから AI スキルをプロジェクトの .claude/ に同期し、ハードコードされた値をプロジェクト固有の値に適応させる。正本からプロジェクトへ AI 資産を同期するときに使う。
---

# AI アセットの同期

Claude 用の正本ソースからスキルをプロジェクトの `.claude/skills/` にコピーし、ハードコードされた値を対象プロジェクトに合わせて適応させる。

**基本原則:** Claude 用 `.claude/` assets の正本ソースが、このスキルで同期する範囲の真実。同期は冪等。値を適応させるが、スキルのワークフロー手順は変えない。

**開始時に宣言:** 「syncing-ai-assets スキルを使用してアセットをこのプロジェクトに同期します。」

**実行場所:** 対象プロジェクト側のセッションで実行する。dotfiles セッションから他プロジェクトを変更してはならない。

## 前提条件

- **正本ソース:** `~/Projects/tool/dotfiles/templates/ai-driven-development/.claude/`
  - このパスは適応ルールにより各プロジェクトに合わせて書き換えられる
- **カタログ:** 正本ソースと同階層の `data/skill-catalog.yaml`
- **台帳:** `~/Projects/tool/dotfiles/templates/ai-driven-development/data/project-registry.yaml`（マシンローカル、gitignore。schema は `project-registry.example.yaml`）
- **同期先:** プロジェクトルートの `.claude/`
- **同期対象:**
  - `skills/` — カタログ選定に基づくスキル
- **対象外:** `.agents/`、`AGENTS.md`、`.codex/` は通常実行では作成・上書きしない。`settings.json` / `settings.local.json` も同期しない。
- **冪等性:** 毎回正本ソースから上書きし、同一の結果を生成する。

## 適応ルール

正本内のハードコードされた値を対象プロジェクトに合わせて書き換える。検出ロジックと書き換えルールは [references/adaptation-rules.md](references/adaptation-rules.md) を参照。

**重要:** 機械的強制（format / analyze / debug コード検出）は pre-commit と CI が担う。AI hooks は同期対象に含めない。

## ワークフロー

### プロジェクトの分析

プロジェクトルートを調査して以下を特定する:

1. **ディレクトリ構成** — 既存のドキュメント、タスク管理、設定ディレクトリ
2. **技術スタック** — `package.json`、`flake.nix`、`Makefile`、`justfile`、`pubspec.yaml`、`Cargo.toml` など → カタログの `stacks` 判定に使う
3. **併用エージェント** — Codex 利用の有無 → カタログの `agents` 判定に使う
4. **ツールチェーン** — lint / format / test の実行方法 → 検証コマンドの適応に使う
5. **タスク管理** — `TODO.md`、`TASKS.md`、GitHub Issues、カスタムタスクファイル
6. **既存の `.claude/` 構成** — 既存の CLAUDE.md やスキル
7. **ブランチ戦略** — ユーザーにヒアリングして決定（[references/adaptation-rules.md](references/adaptation-rules.md) ルール 7 を参照）

### 適応マッピングの構築

[references/adaptation-rules.md](references/adaptation-rules.md) に従い、正本のハードコード値をプロジェクト固有の値にマッピングする。

### スキルの選定（skill-catalog ベース）

`data/skill-catalog.yaml` を読み、次の規則で選定する:

1. **`layer: core`** — すべて含める
2. **`layer: stack`** — プロジェクトの `stacks` / `agents` 条件に合うものだけ含める
3. **`layer: opt-in`** — ユーザーが明示選択したものだけ含める（既定は除外）

各スキルに**選定理由**または**除外理由**を付記する。`intent` 初期値は選定なら `deployed`、除外なら `excluded`。

### 承認を求める

ユーザーに以下を提示する:

1. **適応マッピングテーブル** — 何がどう書き換えられるか、その理由
2. **選定スキル**（layer / 理由付き）
3. **除外スキル**（理由付き）

ユーザーの承認を得るまでコピーに進まない。

### コピーと適応

1. 選定スキルを正本ソースの `skills/` から `.claude/skills/` にコピー
2. 適応マッピングをスキル本文・CLAUDE.md に適用

**ルール:**
- `.claude/skills/` 内の既存ファイルは正本バージョンで上書き
- ユーザーが作成したスキル（正本ソースに存在しないもの）は変更しない（台帳では `intent: local`）
- `.claude/settings.json` と `.claude/settings.local.json` は変更しない

### CLAUDE.md の更新

スキル同期後、プロジェクトの CLAUDE.md をテンプレート（`templates/ai-driven-development/CLAUDE.md`）のスキル連動セクションで更新する。

**テンプレートの場所:** 正本ソースと同じリポジトリの `templates/ai-driven-development/CLAUDE.md`。見つからない場合はユーザーにパスを確認する。

**手順:**

1. テンプレート CLAUDE.md を読み込む
2. プロジェクトの既存 CLAUDE.md を読み込む
3. 以下のセクションをテンプレートから取得し、適応マッピングを適用して反映する:

| セクション | 更新方針 |
|-----------|---------|
| `## 指示の優先順位` | テンプレートで上書き |
| `## ワークフロー` | テンプレートで上書き |
| `## 禁止事項` | テンプレートで上書き |
| `## 作業ログ規約` | テンプレートで上書き＋パスを適応 |
| `## 完了報告フォーマット（必須）` | テンプレートで上書き |

4. 以下は**変更しない**（プロジェクト固有）: `## プロジェクト概要` / `## クイックリファレンス` / `## 設計方針` / その他ユーザー追加セクション
5. テンプレートにあってプロジェクトに無いスキル連動セクションは**追加**する

**承認:** CLAUDE.md の変更差分もスキル同期の承認提示に含める。

### Codex assets の扱い

通常実行では対象プロジェクトの `.agents/`、`AGENTS.md`、`.codex/` を作成・上書きしない。必要な場合は同期完了後に `porting-ai-assets-to-codex` で判断する。

### digest 計算

スキルディレクトリ全体（`SKILL.md` + `references/` 配下）を対象とする。

```bash
# スキルディレクトリ内のファイルをパス順に連結して sha256
find "$skill_dir" -type f | sort | xargs cat | shasum -a 256
```

結果は `sha256:<hex>` 形式で記録する。

### プロジェクトレジストリの更新（schema v2）

**実行場所の整理:**
- プロジェクト側ファイルの変更: このスキルが行う
- 台帳書き込み先: **dotfiles** の `data/project-registry.yaml`
- 台帳の**コミットはしない**（ユーザーが dotfiles 側で確認する）

**手順:**

1. 台帳を読む（無ければ `project-registry.example.yaml` を参考に `version: 2` / `projects: {}` で新規作成）
2. `source_commit` に正本リポジトリの HEAD を書き込む
3. プロジェクトキーを決定（既定: リポジトリ名。衝突時はサフィックスを確認）
4. 各スキルエントリを更新:
   - `intent`: 選定なら `deployed`、除外なら `excluded`、正本に無い固有スキルは `local`
   - `source_digest`: 配布時点の正本スキル digest
   - `local_digest`: 配布直後のローカル digest（適応後。適応差分がある場合は正本と異なり得る）
   - `state`: 配布直後は通常 `in-sync`（適応のみの差分は別途 note 可）。計算規則は scanning スキルを参照
5. `last_scanned` は触らない（scanning 専用）。必要なら `last_synced` を補助的に記録してよい
6. 台帳ファイルを書き込む（dotfiles への書き込み許可が初回に必要）

### ユーザーレベルスキルとの重複チェック

`~/.claude/skills/` に同名があると二重列挙される。重複を**警告として報告**し、退避か除外の選択はユーザーに委ねる。勝手に削除・移動しない。

### 検証と報告

1. **相対パスチェック** — スキル間参照が解決すること
2. **CLAUDE.md 整合性** — 参照スキル名が `.claude/skills/` に存在すること
3. **適応差分** — スキル・CLAUDE.md のサマリー
4. **台帳** — 書き込んだ digest / intent のサマリー（未コミットである旨）

## 補足事項

- `syncing-ai-assets` 自体もコピー対象に含める（クラウド再同期のため）
- `.gitignore` が `.claude/skills/` のコミットを許可していることを確認する
- 正本更新後は正本を pull し、各プロジェクトで再同期する
- Codex 用 assets は暗黙同期しない
