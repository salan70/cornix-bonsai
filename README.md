# Cornix Bonsai

Cornix LP向けのキーマップ編集ツール 💚

Cornix Bonsaiは、Cornix LPのキーマップをブラウザ・CLI・Git・AIエージェントから
読み取り、編集、検証、可視化、バージョン管理するためのローカルファーストなツールです。

## 今すぐ使う

Web UI: <https://salan70.github.io/cornix-bonsai/>

確認済み環境はmacOSとChrome / Chromiumです。WebHIDに対応しないSafariとFirefoxでは
実機接続を利用できません。既存のworkspaceを開く手順と、実機readからworkspaceを作る手順は
[クイックスタート](./docs/user-guide/README.md#クイックスタート)を参照してください。

実機からのreadはキーボードを変更しません。実機を変更するのは、人間が差分を確認して
「実機へ Apply」を実行した場合だけです。

## 利用者向けドキュメント

- [利用者ガイド](./docs/user-guide/README.md)
- [Web UIの使い方](./docs/user-guide/web-ui.md)
- [CLIの使い方](./docs/user-guide/cli.md)
- [Safe Applyと復旧](./docs/user-guide/safe-apply.md)
- [workspaceと用語](./docs/user-guide/workspace-and-terms.md)
- [トラブルシューティング](./docs/user-guide/troubleshooting.md)

## 開発環境から起動する

依存関係とツールチェーンはNix環境で固定しています。初回のsetupではpre-commit / pre-push
hookも導入します。

```bash
nix develop
just setup
just test
just typecheck
just dev
```

production buildをローカルで確認する場合は、別のterminalで次を実行してから
<http://localhost:4173/cornix-bonsai/>をChromium系browserで開きます。

```bash
just build
just preview
```

cloneした環境でCLIを使う方法は[CLIの使い方](./docs/user-guide/cli.md)を参照してください。

## 現在の状況

workspace / CLI / Web UI / WebHID adapterのMVP実装を含みます。mainへのpushはGitHub Pagesへ
自動デプロイされ、headerに利用中buildの短いcommit SHAを表示します。実機USB/BLEの受入確認は
実機と人間の明示操作が必要なため、mock/fixtureの自動検証とは分けて扱います。

## 方針

- Cornix LPを最初の対象とする
- rawなVial表現から独立したSemantic Modelを持つ
- Git管理するdesired stateとして`keymap.yaml`を使う
- Browser UIとCLIで同じCoreを共有する
- `.vil`のimport / exportに対応する
- validation、reference analysis、semantic diff、SVG / PDF renderingを行う
- Vial / WebHID経由で実機からreadする
- 実機writeはbackupとverifyを伴い、人間の明示操作でのみ行う
- AIエージェントは設定編集や検証を行えるが、実機へ直接writeしない

## 開発者向けドキュメント

重要な設計判断は`docs/decisions/`、コードと対応する実装仕様は`docs/specs/`に記録します。
[ドキュメントの責務](./docs/README.md)も参照してください。

プロジェクト内の文章・ドキュメント・Issueは日本語を基本とします。コード識別子、CLIコマンド、
プロトコル名などは必要に応じて英語表記を維持します。
