---
name: verifying-environment
description: Use when starting development tasks, before running tests, lint, build, deploy, or toolchain commands (node, bun, npx, bunx, dart, just, wrangler), and when diagnosing test/lint/build failures, suspected pre-existing failures, wrong binaries, stale caches, PATH mismatches, or agent vs user result disagreement.
---

# 環境検証

**基本原則:** 失敗の原因をコードと決めつける前に、解決バイナリとキャッシュを確認する。解決順序とキャッシュの扱いは本スキルが正本。

## 開始時（軽量プリフライト）

開発系タスク開始時、およびテスト・lint・ビルド・実行・デプロイの前に実行する。問題なければ本作業へ進む。

```bash
printf 'IN_NIX_SHELL=%s DIRENV_DIR=%s\n' "${IN_NIX_SHELL:-}" "${DIRENV_DIR:-}"
test -f flake.nix && echo "flake: yes" || echo "flake: no"
command -v node; node --version 2>/dev/null || true
command -v bun; bun --version 2>/dev/null || true
```

マーカーがあるツールだけ確認する（`package.json` / `bun.lock*` → node・bun、`pubspec.yaml` → dart）。

`flake.nix` があるのに `IN_NIX_SHELL` と `DIRENV_DIR` が空、または解決パスが `~/.nix-profile` / `/opt/homebrew` なら、以降は `nix develop -c <cmd>` で実行する。`bunx` / `npx` も同様（shim が PATH 上の node を拾う）。

## 失敗時（完全診断）

「pre-existing」と結論する前に、この順を完了する。飛ばさない。

1. `which -a <tool>` と `<tool> --version` で解決バイナリを出す。
2. ピン留め（flake / just / mise）と一致するか確認する。`nix develop -c which <tool>` と比較する。
3. 関連キャッシュを消す。
4. ピン留め環境で同じコマンドを再実行する。
5. それでも失敗する場合のみ pre-existing とする。証拠（パスとバージョン）を残す。

エージェントとユーザーで結果が違うときは、双方の解決パスを比較する。

### キャッシュ（プロジェクトに合わせて適応）

| 兆候 | クリア例 |
| --- | --- |
| rumdl の偽陽性、前方参照リンク | `rm -rf .rumdl_cache` |
| bun の奇妙なモジュール解決 | `rm -rf node_modules/.cache`（プロジェクト慣例に従う） |
| Dart / Flutter の残留 VM | `just kill_stale_dart_vm` または相当スクリプト |

一覧に無いツールは、そのツールのキャッシュディレクトリをプロジェクトで探す。

### 付随チェック

- git worktree: gitignored の `.env` 等がメイン作業ツリーからコピーされているか。
- 同一コマンドの重複プロセス（Dart VM 等）が残っていないか。

## 危険信号

- 「既存の失敗だから無視」と、バイナリ確認なしに結論する
- direnv 未ロードのまま `bunx` / `npx` / `wrangler` を叩く
- キャッシュを消さずに lint 偽陽性をコード欠陥とする
