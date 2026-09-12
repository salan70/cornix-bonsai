#!/usr/bin/env bash
# commit-msg hook: コミットメッセージ中の裸の @token を拒否する。
#
# GitHub はコミットメッセージを Markdown として描画せず、バッククォート内でも
# @name を user / organization へのメンションとしてリンク化する。
# メールアドレス（user@host）は @ の直前が単語文字のため一致しない。
set -euo pipefail

msg_file="$1"

# git が commit 時に除去する comment 行（# 始まり）は検査対象外
matches=$(grep -vE '^#' "$msg_file" | grep -nE '(^|[^[:alnum:]_])@[A-Za-z0-9][A-Za-z0-9-]*' || true)

if [ -n "$matches" ]; then
  {
    echo "commit-msg: 裸の @token を検出しました。GitHub 上でメンションとしてリンク化されます。"
    echo "$matches"
    echo "@ を含まない表現へ言い換えてください（例: CSSの@layer → CSS layer規則）。"
    echo "コミットメッセージは Markdown 描画されないため、バッククォートでは抑止できません。"
  } >&2
  exit 1
fi
