# Cornix Bonsai 利用者ガイド

Cornix Bonsaiは、Cornix LPの設定をローカルのworkspaceへ保存し、Web UIまたはCLIで編集・検証する
ツールです。Web UIでは、実機の現在状態をreadし、確認した差分だけを実機へApplyできます。

## 対応環境

確認済みの利用環境は次のとおりです。

- macOS
- ChromeまたはChromium
- Vial protocolに対応したCornix LP

Chromeと同じChromium系のEdge / Braveでも必要なWeb APIを利用できますが、現時点では確認済み環境に
含めません。SafariとFirefoxはWebHIDに対応していないため、実機接続を利用できません。CLIは
リポジトリをcloneし、Nixで固定した開発環境から実行します。

Web UI: <https://salan70.github.io/cornix-bonsai/>

## 操作前に知っておくこと

- `実機から再読み込み`やworkspace作成のためのfull readは、実機を書き換えません。
- Web UIでの編集は、先にworkspaceの`keymap.yaml`へ保存されます。
- 実機を書き換えるのは、差分を確認して`実機へ Apply…`を実行した場合だけです。
- Applyでは毎回full readのbackupを保存しますが、電源を切っても設定が残ることまでは保証しません。
- CLIには実機へwriteするコマンドがありません。

## クイックスタート

### 既存のworkspaceを開く

1. [Web UI](https://salan70.github.io/cornix-bonsai/)をChromeまたはChromiumで開きます。
2. `Workspaceを開く`を選び、`keymap.yaml`があるdirectoryを指定します。
3. キーを選択し、Keymap画面の編集panelまたはkeycode pickerで設定を変更します。
4. 画面下部のstatusで、`keymap.yamlへ保存した`ことと診断件数を確認します。
5. 実機との差分も確認する場合は、`接続`、`実機から再読み込み`の順に実行します。
6. エラー・警告・差分を確認し、必要な場合だけ`実機へ Apply…`へ進みます。

実機へ接続しなくても、workspaceの編集、validation、VIL・SVG・PDFの書き出しは利用できます。
Applyには、同じCornix LPへ接続して取得した最新のfull readが必要です。

### 実機readからworkspaceを作る

1. Web UIで`Workspaceを開く`を選び、workspaceとして使う空のdirectoryを指定します。
2. `keymap.yamlが無い`と表示されたら、`実機readでworkspaceを作成`を選びます。
3. ブラウザのdevice選択画面で、対象のCornix LPを選びます。
4. full readが完了するまで、接続を外さずに待ちます。
5. `keymap.yaml`と`cornix/definitions/<digest>.json`が作成されたことを確認します。

この手順は実機の状態をworkspaceへ読み取るだけで、実機へwriteしません。

## 目的別のガイド

- [Web UIの使い方](./web-ui.md): workspace、編集、4つのtab、入出力
- [CLIの使い方](./cli.md): setup、validation、解析、差分、render、VIL入出力
- [Safe Applyと復旧](./safe-apply.md): 実機writeの手順、失敗・中断、backup復元
- [workspaceと用語](./workspace-and-terms.md): ファイル配置、Git管理、画面で使う用語
- [トラブルシューティング](./troubleshooting.md): browser、権限、接続、workspaceの問題
