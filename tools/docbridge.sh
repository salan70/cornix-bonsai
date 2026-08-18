#!/usr/bin/env bash
# DocBridge を単一のバージョン定義（.docbridge-version）で呼び出す。
# flake.nix / CI / pre-commit はすべてこの版を参照する。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
version="$(tr -d '[:space:]' < .docbridge-version)"
exec pnpm dlx "docbridge@${version}" "$@"
