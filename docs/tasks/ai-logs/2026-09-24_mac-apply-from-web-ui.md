# Mac の設定を Web UI から適用する

2026-09-24。
Mac 内蔵キーボードの変更手順を極力シンプルにしたいという依頼から、設計を grilling で詰めて実装した。

## Fact

- 変更前の手順は Web UI で編集 → `just mac apply` → fingerprint をコピーして `--confirm`、とターミナルとの行き来が要った。
- 利用者の編集は Web UI が中心で、利用者は本人だけ、マシンは複数ある。
- `cornix mac apply` の手順を `src/mac/apply-service.ts` へ切り出し、CLI の既存テスト 21 件がそのまま通ることを確認した。
- scratch の `karabiner.json` コピーと本物の `karabiner_cli` lint・配列検出で、HTTP 越しに status → plan → apply を通した。backup は元のファイルとバイト単位で一致した。`Origin` の無いリクエストと `Sec-Fetch-Site: cross-site` は 403 になった。
- 本物の `~/.config/karabiner/karabiner.json` と Karabiner の選択中 profile（`Default profile`）には触れていない。

## Decision

ADR 0034 に記録した。
grilling で決めた論点は次のとおり。

| 論点                   | 決定                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| 正とする yaml          | ディスク上のファイル。画面の内容とは正規形の digest で突き合わせる |
| サーバーの形           | `node:http` で `dist/` と API だけを配る（ADR 0033）               |
| port                   | 5178 に固定し、使用中なら止める（ADR 0033）                        |
| 利用者                 | 本人だけ。Pages をやめる（ADR 0033）                               |
| API の防御             | ヘッダーの確認だけ。トークンは持たない                             |
| 配列の不一致           | このマシンの配列と一致する編集対象だけ適用できる                   |
| CLI                    | `--confirm` はそのまま。対話式は作らない                           |
| 差分の計算             | ボタンを押したときだけ                                             |
| Karabiner 不在         | API は計画の段階で止める                                           |
| profile 切り替えの失敗 | 巻き戻さず、切り替えだけをやり直す                                 |

## Open Question

- Web UI の適用ダイアログはブラウザで操作して確かめていない。File System Access のフォルダ選択を自動操作できないため、利用者の確認に委ねる。
- Spike R-007（Caps Lock と Karabiner の前後関係）は未実施のまま。
