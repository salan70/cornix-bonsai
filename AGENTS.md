# AGENTS.md

## プロジェクト

Cornix BonsaiはCornix LP向けのキーマップ編集ツールです。

## 許可する操作

- プロジェクトのソースコード・ドキュメントを編集する
- workspace fixtureやexampleがある場合に`keymap.yaml`を編集する
- validation、analysis、diff、render、exportを実行する
- test・fixtureを作成、更新する
- 依頼された場合にcommit・pull requestを作成する

## 禁止する操作

- 物理キーボードへ設定を直接writeする
- firmwareをflashする
- bootloader / UF2状態へ移行・操作する
- reset、clear-peerなど破壊的な実機操作を行う

## 設計ルール

- Semantic CoreをReact、filesystem、WebHIDの詳細から独立させる
- Vial / WebHIDを外部adapterとして扱う
- 調査ではFact / Inference / Decision / Open Questionを区別する
- 不確実な外部挙動は、設計を固定する前に調査または最小Spikeで検証する
- 重要な設計判断は`docs/decisions/`へADRとして残す
- README、Issue、ADR、その他ドキュメント間で詳細情報を重複させない
- プロジェクト内の文章・ドキュメント・Issueは日本語を基本とする。コード識別子、CLIコマンド、プロトコル名などは必要に応じて英語表記を維持する

## 実機操作の安全性

実機writeには人間の明示操作を必要とします。想定するApplyフローは以下です。

```text
現在状態をread
→ backup
→ strict validation
→ semantic diff
→ 人間が確認
→ 差分write
→ 再readしてverify
```
