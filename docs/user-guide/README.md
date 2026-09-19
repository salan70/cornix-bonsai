# Cornix Bonsai 利用者ガイド

Cornix Bonsai は Cornix LP の設定編集ツールです。
ローカルの workspace へ保存し、Web UI や CLI で編集・検証します。
Web UI では実機状態を読み取り、確認した差分だけを実機へ反映（Apply）できます。

Web UI: <https://salan70.github.io/cornix-bonsai/>

## 対応環境

確認済みの利用環境は次のとおりです。

- macOS
- Chrome または Chromium
- Vial protocol に対応した Cornix LP

Edge や Brave でも動作しますが、確認済み環境には含めません。
Safari と Firefox は WebHID に非対応のため、実機接続を利用できません。
CLI はリポジトリを clone し、Nix 環境から実行します。

## 安全の基本原則

実機の誤設定や故障を防ぐため、以下の原則で動作します。

- 実機の読み取り（full read）は、実機の設定を変更しません。
- Web UI での編集内容は、まずローカルの `keymap.yaml` へ保存されます。
- 実機が変更されるのは、差分を確認して `実機へ Apply…` を実行したときだけです。
- Apply の直前には、必ず自動でバックアップが保存されます。
- CLI には Cornix LP への書き込み機能はありません（読み取り・検証・ファイル生成のみ）。

## クイックスタート

実機に接続しなくても、workspace の編集や各種ファイルの書き出しは利用できます。

### 既存の workspace を開く

1. [Web UI](https://salan70.github.io/cornix-bonsai/) を Chrome または Chromium で開きます。
2. `Workspaceを開く` を選び、`keymap.yaml` のあるディレクトリを指定します。
3. キーを選択し、Keymap 画面の編集パネルや keycode picker で設定を変更します。
4. 画面下部の表示で、`keymap.yamlへ保存した` と表示されたことを確認します。
5. 実機と同期する場合は、`接続`、`実機から再読み込み` の順に実行します。
6. 差分を確認し、問題がなければ `実機へ Apply…` へ進みます。

### 実機読み取りから workspace を新規作成する

1. Web UI で `Workspaceを開く` を選び、空のディレクトリを指定します。
2. `keymap.yamlが無い` と表示されたら、`実機readでworkspaceを作成` を選びます。
3. デバイス選択画面で、対象の Cornix LP を選びます。
4. 読み取りが完了するまで接続を外さずに待ちます。
5. `keymap.yaml` と definition ファイルの生成を確認します。

この操作は実機の状態を読み取るだけであり、実機の設定は変更しません。

## 目的別ガイド

用途に合わせて以下のドキュメントを参照してください。

| ドキュメント                                   | 主な内容                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| [Web UI の使い方](./web-ui.md)                 | 画面構成、各タブの編集機能、VIL や画像の入出力         |
| [CLI の使い方](./cli.md)                       | 検証、到達性解析、差分確認、Mac 内蔵キーボード管理     |
| [Safe Apply と復旧](./safe-apply.md)           | 実機書き込み手順、エラーと警告の基準、バックアップ復元 |
| [workspace と用語](./workspace-and-terms.md)   | ファイル配置、Git 管理対象、重要用語の一覧             |
| [トラブルシューティング](./troubleshooting.md) | 接続失敗、保存不可、権限エラーなどの対処手順           |
