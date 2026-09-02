# workspaceと用語

## 用語

| 用語          | 意味                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| workspace     | `keymap.yaml`と関連ファイルを置く、利用者が選んだ1つのdirectory        |
| desired state | workspaceに保存した、実機へ反映したい状態                              |
| current state | 最後のfull readで取得した実機の状態                                    |
| full read     | keymap、definition、容量など、比較に必要な実機状態を一式読み取る操作   |
| definition    | キーの物理配置やcustom keycodeを解釈するためのkeyboard definition      |
| VIL           | Vialが扱うキーマップのexport形式。拡張子は`.vil`                       |
| validation    | workspaceの構造、keycode、参照、実機との互換性を検査する処理           |
| semantic diff | 表記だけでなく、キー・layer・behaviorなど意味単位で示す差分            |
| Apply         | 確認済みのdesired stateとの差分を実機へwriteし、再readでverifyする操作 |
| WebHID        | Chromium系browserから対応HID deviceへ接続するWeb API                   |
| UID           | キーボードを識別し、別deviceへの誤Applyを防ぐための値                  |
| digest        | definitionの内容から計算し、取り違えや変更を検出するSHA-256値          |

## ファイル配置

```text
<workspace>/
├── keymap.yaml
└── cornix/
    ├── definitions/<digest>.json
    ├── labels.yaml
    ├── acknowledgements.json
    ├── backups/<timestamp>.vil
    ├── backups/latest.vil
    └── generated/<name>
```

| Path                           | 内容                              | Git管理の扱い |
| ------------------------------ | --------------------------------- | ------------- |
| `keymap.yaml`                  | desired stateとdefinition binding | 管理対象      |
| `cornix/definitions/`          | keymapの解釈に使うdefinition      | 管理対象      |
| `cornix/labels.yaml`           | layer名とraw keycode式の表示名    | 管理対象      |
| `cornix/acknowledgements.json` | Apply warningの確認ID             | 管理対象      |
| `cornix/backups/`              | Apply前の実機full read            | 管理外        |
| `cornix/generated/`            | VIL、SVG、PDFなどの生成物         | 管理外        |

workspaceをGit repositoryにする場合は、次を`.gitignore`へ追加します。

```gitignore
cornix/backups/
cornix/generated/
```

backupや生成物を共有したい場合は、必要なファイルだけを別の方法で渡してください。

## `keymap.yaml`が正本である理由

Web UIで編集した内容は、まず`keymap.yaml`へ保存されます。実機の状態を直接編集するのではなく、
workspaceをdesired stateの正本にすることで、次の操作が可能になります。

- Gitで変更履歴と差分を確認する
- CLIとWeb UIで同じ状態を検証する
- 実機へwriteする前にsemantic diffを確認する
- 複数のMacでrepositoryを同期する
- AIエージェントにファイル編集とvalidationだけを依頼し、実機writeを人間に限定する

## Definition binding

`keymap.yaml`は、対応するdefinitionのpathとdigestを保持します。Cornix Bonsaiは読み込み時とApply前に
この組み合わせを検証し、別のdefinitionや変更されたファイルを誤って使わないようにします。

definition fileや`keymap.yaml`内のbindingを手作業で置き換えないでください。旧digest規則のworkspaceは、
Web UIが内容の一致を確認できた場合だけ`bindingを移行する`操作を表示します。

## 表示名と実機状態

`cornix/labels.yaml`のlayer名とkeycode表示名は、Web UI、SVG、PDFを読みやすくするための情報です。
実機へwriteする値には含まれず、表示名だけを変更しても実機との差分は増えません。

## Acknowledgement

Apply時に確認したwarningは`cornix/acknowledgements.json`へ保存されます。確認IDには警告の根拠が含まれる
ため、keymapや実機状態が変わると同じwarningでも再確認が必要になります。
