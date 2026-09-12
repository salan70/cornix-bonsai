# Web UIの使い方

Web UIは、利用者が選んだローカルdirectoryをworkspaceとして扱います。`keymap.yaml`やbackupを
外部サービスへ送ることなく、ブラウザから直接読み書きします。

Web UI: <https://salan70.github.io/cornix-bonsai/>

対応環境と初回手順は[利用者ガイド](./README.md)を参照してください。

## Headerとnavigationの操作

| 表示                 | 動作                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `接続`               | WebHIDのdevice選択画面を開き、Cornix LPへ接続する                |
| `切断`               | 現在のdevice sessionを閉じ、取得済みの実機状態を破棄する         |
| `実機から再読み込み` | 実機をfull readし、workspaceのdesired stateとの差分を計算する    |
| `Workspace`          | 別のworkspace directoryを選ぶ                                    |
| `VIL読込`            | `.vil`を現在のworkspaceのdesired stateへ取り込む                 |
| `VIL書出`            | `cornix/generated/keymap.vil`へ書き出す                          |
| `再読込`             | filesystem上の`keymap.yaml`と付随ファイルを読み直す              |
| `backup から復元`    | 最新backupをdesired stateへ読み込み、通常の確認・Apply手順へ戻す |
| `利用者ガイド`       | GitHub上のこのガイドを新しいtabで開く                            |
| `テーマ`             | システム・ライト・ダークから表示テーマを選ぶ                     |

`接続`だけではfull readを行いません。実機との差分を確認するには、接続後に
`実機から再読み込み`を実行してください。

## Keymap

Keymapでは、layerごとの物理キーとencoderを編集します。

1. 盤面上のキーまたはencoderを選びます。
2. 編集panelで、キー全体・Tap・Holdのどこを変更するか選びます。
3. keycode pickerから値を選ぶか、詳細のraw keycodeを編集します。
4. statusに`keymap.yamlへ保存した`と表示されることを確認します。

盤面は方向キーで選択を移動でき、Enterで編集panelへ移動し、Escで戻れます。pickerで表現できない
custom keycodeなどはraw keycode入力を使います。

### 表示名

編集panelの`表示名（任意）`では、同じraw keycode式にworkspace共通の名前を付けられます。名前は
`cornix/labels.yaml`へ保存され、空欄にすると削除されます。

表示名は画面とSVG/PDFを読みやすくするためのmetadataです。`keymap.yaml`、validation、実機差分、
Apply対象には影響しません。

## Overview

Overviewでは、参照されているlayerとTap Danceをまとめて確認できます。

- layer操作の参照元へpointerを合わせるかfocusすると、参照先との関係を表示します。
- layer名を選ぶと、workspace用の表示名を編集できます。
- `参照なし layerを表示`で、通常は省略されるlayerも確認できます。
- `SVG で書き出す`と`PDF で書き出す`は、Keymapで選択中のlayerを書き出します。

出力先は`cornix/generated/keymap-layer-<layer>.svg`または
`cornix/generated/keymap-layer-<layer>.pdf`です。

## Behaviors

Behaviorsでは、Tap Dance、Combo、Settingsを直接編集します。入力は変更のたびにworkspaceへ保存されます。

- Tap DanceのtimeoutとSettingsは0〜65535の整数です。
- 不正な値は保存されず、画面下部のstatusへ理由が表示されます。
- Tap DanceやComboで表示名があるkeycodeは、raw値と区別できる形で表示されます。

## Mac（MacBook内蔵キーボード）

Macタブでは、workspaceの`mac-keyboard.yaml`（MacBook内蔵キーボードのdesired state）を
物理盤面で編集します。

- `mac-keyboard.yaml`が無い場合は「mac-keyboard.yamlを作成」で初期状態（JIS・空のlayer 0）を
  作成できます。配列がUSの場合はファイルの`layout:`を`ansi`へ変更してください。
- 盤面は`layout`宣言（JIS / ANSI）に応じて切り替わります。割り当ての無いキーは薄い表示で、
  押した入力がそのまま通る「素通し」を意味します。
- キーを選んでpickerまたはside panelで割り当てを編集します。編集は自動で保存されます。
  「割り当てを外す」で素通しへ戻せます（`KC_NO`は入力を捨てる別の割り当てです）。
- layer chipで疎なlayerを切り替え、`+`で新しいlayerを追加します。layer番号はCornix側の
  layerとは別の空間です。
- Karabinerで表現できない割り当ては診断（エラー）になります。エラーがあるとassetは
  書き出されません。
- 「Karabiner assetを書き出す」は編集中の内容から
  `cornix/generated/karabiner-complex-modifications.json`を生成します。

**Web UIから実機（karabiner.json）への適用はできません。** 適用は
[CLIのMacBook内蔵キーボード](./cli.md#macbook内蔵キーボード)の手順
（`cornix mac diff`→`cornix mac apply`）で行います。

## References

Referencesでは、次の情報を確認できます。

- Tap DanceとMacroの使用箇所数
- 未使用のTap DanceとMacro
- Base layerから到達できないlayer
- workspace全体の診断

到達不能の表示は解析結果です。Applyを止めるかどうかは、診断severityとApply時の確認内容で決まります。

## 診断と差分

画面下部には、エラー・警告・情報、実機との差分件数、保存statusが常に表示されます。

- 診断件数を選ぶと、該当severityで絞った診断panelを開きます。
- エラーはApplyを止めます。
- 警告は内容ごとの確認が必要です。確認済みの根拠が変わると再確認を求めます。
- 実機との差分は、最後のfull readとworkspaceのdesired stateを比較した結果です。

実機へ反映するときは[Safe Applyと復旧](./safe-apply.md)を先に確認してください。

## VILの入出力

`VIL読込`は、選択した`.vil`を現在のworkspaceのdesired stateへ取り込みます。実機へ直接writeせず、
`keymap.yaml`へ保存した後にvalidationと差分確認へ進みます。別のキーボードの`.vil`を読み込んだ場合は、
UIDやdefinitionの不一致によってApplyが停止します。

`VIL書出`は、現在のdesired stateを`cornix/generated/keymap.vil`へ保存します。

## 外部エディタと併用する

Web UIは、読み込み後にfilesystem上のファイルが変更されていないか保存前に確認します。外部エディタの
変更を検出した場合は上書きせず、statusへ競合を表示します。

外部の変更を採用する場合は、外部エディタで保存を完了してから`再読込`を実行してください。Web UI側に
未保存の意図がある場合は、再読込の前に内容を退避してください。
