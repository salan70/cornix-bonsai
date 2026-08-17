# Cornix Bonsai

Cornix LP向けのキーマップ編集ツール 💚

Cornix Bonsaiは、Cornix LPのキーマップをブラウザ・CLI・Git・AIエージェントから読み取り、編集、検証、可視化、バージョン管理するためのローカルファーストなツールです。

## 現在の状況

設計・調査の初期段階です。

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

## 表記

プロジェクト内の文章・ドキュメント・Issueは日本語を基本とします。コード識別子、CLIコマンド、プロトコル名などは必要に応じて英語表記を維持します。

重要な設計判断は`docs/decisions/`にADRとして記録します。
