# トラブルシューティング

問題が起きたときは、画面下部のstatus、診断code、headerのbuild SHAを記録してください。実機writeに
関係する問題では、推測で操作を続けず、再接続後のfull readからやり直します。

## 実機接続を利用できない

### SafariまたはFirefoxを使っている

SafariとFirefoxはWebHIDに対応していません。macOSのChromeまたはChromiumでWeb UIを開いてください。

### Cornix LPがdevice一覧に出ない

次を順に確認します。

1. Cornix LPの電源とUSBまたはBLE接続を確認します。
2. Vial protocol対応firmwareであることを確認します。
3. Web UIの`接続`をもう一度選びます。
4. browserまたはOSに以前の接続が残っている場合は、いったん切断してから再接続します。

bootloader、reset、flash操作はこのガイドの復旧手順に含みません。

### 接続後も差分が0件のまま

`接続`はdevice sessionを開くだけです。`実機から再読み込み`を実行してfull readを完了させてください。

## Workspaceを開けない

### reload後にworkspaceが復帰しない

directoryへのbrowser権限が残っていない場合は自動復帰できません。`Workspace`または
`Workspaceを開く`から同じdirectoryを選び直してください。

### `keymap.yamlが無い`と表示される

選択したdirectoryはまだworkspaceではありません。新規作成する場合はCornix LPを用意し、
`実機readでworkspaceを作成`を選びます。この操作が作成するのは`keymap.yaml`とdefinition fileで、
実機へwriteしません。

既存workspaceを開くつもりだった場合は、別のdirectoryを選び直してください。

### `definition bindingが古いdigest規則のまま`と表示される

Web UIが保存済みdefinitionの内容を検証できた場合にだけ表示されます。画面上の現在値と移行後の値を確認し、
`bindingを移行する`を選びます。keymapの内容と実機は変更されません。

### definitionのdigestまたはpathが一致しない

`keymap.yaml`が参照するdefinitionと実ファイルが一致していません。Applyせず、次を確認してください。

- Gitで`keymap.yaml`と`cornix/definitions/`が同じ変更として取得されているか
- 別のworkspaceからdefinitionをコピーしていないか
- conflict解消でbindingのpathやdigestを手編集していないか

正しい履歴へ戻すか、正しいworkspaceを選び直してから再読込します。

## 編集内容を保存できない

### 外部変更との競合が表示される

Web UIでworkspaceを開いた後に、外部エディタや別processが同じファイルを変更しています。Cornix Bonsaiは
外部変更を上書きしません。

1. 外部エディタ側の変更を保存し、必要ならGit diffを確認します。
2. Web UI側だけにある意図を別途記録します。
3. `再読込`でfilesystem上の状態を取り込みます。
4. 必要な編集をWeb UIでもう一度行います。

### 入力した値が保存されない

Tap Dance timeoutとSettingsは0〜65535の整数だけを受け付けます。statusに表示された理由を確認して
修正してください。raw keycodeの問題は診断panelのcodeとmessageを確認します。

## Applyできない

### `実機へ Apply…`が無効

Applyを有効にするには、次のすべてが必要です。

- workspaceを開いている
- 実機へ接続している
- 現在のsessionでfull readが完了している
- 実機との差分が1件以上ある

### errorがある

errorは確認操作で越えられません。診断件数を選び、対象とmessageを確認してworkspaceまたは接続先を
修正します。UID・definition不一致の場合は別deviceへの誤Applyを防ぐ停止なので、無効化しません。

### warningの確認が外れた

warningの根拠となるkeymap、definition、実機状態、差分のいずれかが変わると、以前の確認は無効です。
新しい内容を読み、改めて判断してください。

### Applyが中断またはtimeoutした

続きから再開しません。実機を再接続し、full readを最初から行って差分を再計算します。詳しくは
[中断・切断・verify失敗](./safe-apply.md#中断切断verify失敗)を参照してください。

## Backupと生成物が見つからない

- Apply前のbackupは`cornix/backups/`にあります。
- 最新backupは`cornix/backups/latest.vil`です。
- Web UIのVIL、SVG、PDF出力は`cornix/generated/`にあります。
- CLIの出力は、`--out`で指定したworkspace内のpathにあります。

`cornix/backups/`と`cornix/generated/`は通常Git管理しません。

## Web UIの更新が見えない

headerの`build`に続く短いcommit SHAとbuild時刻を確認します。GitHub Pagesへのdeploy後もbrowser cacheの
影響で反映に時間がかかる場合があります。ページを再読み込みし、しばらく待ってからbuild表示を再確認して
ください。

## CLIが失敗する

CLIは`cornix: <理由>`を標準エラーへ表示します。よくある原因は次のとおりです。

- `--workspace`が誤っている、または`keymap.yaml`が無い
- definition fileが無い、またはdigestが一致しない
- `diff`の`--against`を省略している
- `import vil`の`.vil`または`--definition`を省略している
- `render`へ`svg` / `pdf`以外のformatを指定している
- Nix環境外のNode.jsやtoolを直接実行している

direnv済みshell、または`nix develop`内で同じコマンドを再実行してください。
