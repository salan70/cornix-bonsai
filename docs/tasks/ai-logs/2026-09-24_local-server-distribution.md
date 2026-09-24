# Web UI の配布を GitHub Pages からローカルサーバーへ移す

2026-09-24。
Mac の適用を Web UI から行う設計を詰めるなかで、配布の前提を見直した。

## Fact

- 利用者は本人だけで、マシンは複数ある。どのマシンにも Mac 適用のため clone と Nix 環境がある。
- Web UI の origin ごとに workspace の権限とテーマを保存している（ADR 0020）。
- `vite build` の成果物を `node:http` で配信し、`/` と hash 付き asset が 200、POST が 405 を返すことをローカルで確認した。

## Decision

ADR 0033 に記録した。
Pages をやめ、`just ui` で build してから `127.0.0.1:5178` で配信する。
port は固定し、使用中なら止める。

## Open Question

- 公開中の Pages サイトは deploy が止まっただけで残っている。非公開化は repository Settings の操作で、利用者の判断に委ねる。
