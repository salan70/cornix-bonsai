# Cornix Bonsai のコマンド定義。
# ツールチェーンは flake.nix が固定し、コマンドはこのファイルが唯一の定義元。
# direnv 済みシェル、または `nix develop -c just <recipe>` で実行する。

# 引数なしで一覧を表示する
default:
    @just --list

# pre-commit / pre-push フックを導入する（初回のみ）
setup:
    pre-commit install --hook-type pre-commit --hook-type pre-push

# ツールチェーンのバージョンを表示する
versions:
    @node --version
    @pnpm --version
    @echo "docbridge: $(tr -d '[:space:]' < .docbridge-version)"

# すべての検証を実行する（pre-commit 全体）
lint:
    pre-commit run --all-files

# TypeScript / JavaScript を lint する
lint-ts:
    oxlint --ignore-pattern '.direnv/**' --ignore-pattern '.claude/**' --ignore-pattern '.agents/**' .

# Markdown を lint する
# .direnv（flake inputs）と vendor 資産（.claude / .agents）は対象外。
# pre-commit 側の exclude と範囲を揃えている。
lint-md:
    markdownlint-cli2 "**/*.md" "!.direnv/**" "!node_modules/**" "!.claude/**" "!.agents/**"

# コードを整形する
# .claude / .agents は正本からコピーした vendor 資産のため整形しない。
# 整形すると正本との差分が生まれ、再同期のたびに衝突する。
format:
    oxfmt --write . '!.claude/**' '!.agents/**'

# テストを実行する
test:
    pnpm test

# 任意の docbridge サブコマンドを実行する（例: just docbridge graph）
docbridge *ARGS:
    ./tools/docbridge.sh {{ARGS}}

# コードと docs/specs/ のリンク切れを検証する
docbridge-check:
    ./tools/docbridge.sh check

# 未ドキュメントのsymbol・未リンクのsectionを監査する
docbridge-audit:
    ./tools/docbridge.sh check --audit

# push 対象の変更セットに対して related-gate を実行する
docbridge-related:
    ./tools/docbridge-related.sh
