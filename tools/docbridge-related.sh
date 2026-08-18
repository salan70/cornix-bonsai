#!/usr/bin/env bash
# pre-push 用: push 対象の変更セットに対して related-gate を実行する。
# CI と同じく informational。リンク先の未更新を報告するだけで push は止めない。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# upstream が無い場合（初回 push など）は比較対象が無いのでスキップする
if ! upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  echo "docbridge related-gate: upstream が未設定のためスキップします。"
  exit 0
fi

changed="$(git diff --name-only "${upstream}...HEAD")"
if [ -z "$changed" ]; then
  echo "docbridge related-gate: 変更ファイルがありません。"
  exit 0
fi

if printf '%s\n' "$changed" | ./tools/docbridge.sh related --stdin --gate; then
  echo "docbridge related-gate: リンク先カウンターパートはすべて変更セットに含まれています。"
else
  echo
  echo "docbridge related-gate: 上記のカウンターパートはこの push で更新されていません。"
  echo "更新するか、更新不要な理由を PR に記載してください（push はブロックしません）。"
fi
exit 0
