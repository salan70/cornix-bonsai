---
name: verifying-environment
description: 開発開始時、test・lint・build前、PATHやキャッシュに起因する失敗診断時に使う。
---

# 環境検証

失敗をコードやpre-existingの問題と判断する前に、実行環境を確認する。

## 軽量プリフライト

1. `IN_NIX_SHELL`と`DIRENV_DIR`を確認する。
2. リポジトリの`flake.nix`、mise、devbox、package managerのmarkerを確認する。
3. 実行するtoolの`command -v <tool>`と`<tool> --version`を確認する。
4. pin留め環境がある場合は、その環境経由でtest・lint・buildを実行する。

`flake.nix`がありdirenv未読込、またはtoolが`/opt/homebrew`や`~/.nix-profile`へ解決される場合は、`nix develop -c <command>`と比較する。

## 失敗診断

1. hostとpin留め環境のtool path・versionを比較する。
2. project固有のcache、重複process、worktreeで欠落したgitignored設定を確認する。
3. 安全に再生成できるcacheだけを消し、同じcommandをpin留め環境で再実行する。
4. それでも再現した場合だけpre-existingと報告し、path・version・command・errorを残す。
