# CLIの使い方

CLIはWeb UIと同じCoreを使い、workspaceのvalidation、解析、差分、SVG/PDF rendering、VIL入出力を
行います。CLIにはWebHID接続や実機writeのコマンドはありません。

## Setup

CLIはnpm packageとして配布せず、cloneしたリポジトリのNix環境から実行します。

```bash
git clone https://github.com/salan70/cornix-bonsai.git
cd cornix-bonsai
direnv allow
just setup
```

direnvを使わない場合は、先に`nix develop`へ入ってから`just cornix ...`を実行します。複数のMacで
使う場合は各マシンで一度setupし、更新時に`git pull`を実行します。

## 共通規則

```text
just cornix <command> --workspace <directory>
```

- `--workspace`を省略すると、現在のdirectoryをworkspaceとして使います。
- 入出力ファイルの相対pathはworkspaceを基準に解決します。
- コマンドが失敗すると`cornix: <理由>`を標準エラーへ出力し、終了コード1を返します。
- `validate`と`analyze`はerror診断が1件以上ある場合に終了コード1、それ以外は0を返します。

## VILからworkspaceを作る

```bash
just cornix import vil baseline.vil \
  --definition vial-definition.json \
  --workspace /path/to/workspace
```

`.vil`とkeyboard definitionを読み込み、次のファイルを作成します。

```text
keymap.yaml
cornix/definitions/<digest>.json
```

同じ名前のworkspaceファイルがある場合は書き換えるため、既存workspaceでは事前にGitの状態を確認して
ください。成功時は`keymap.yaml`と出力します。

## Validation

```bash
just cornix validate --workspace /path/to/workspace
```

診断件数と診断一覧をJSONで出力します。

```json
{
  "summary": {
    "error": 0,
    "warning": 0,
    "information": 0
  },
  "diagnostics": []
}
```

警告や情報だけの場合は終了コード0です。errorがある場合は終了コード1になるため、scriptやGit hookでも
判定できます。

## 参照と到達性の解析

```bash
just cornix analyze --workspace /path/to/workspace
```

validation結果に加え、到達可能なlayerとlayer操作のedgeをJSONで出力します。未使用項目の確認や、
意図せず到達不能になったlayerの調査に使います。

## VILとの差分

```bash
just cornix diff \
  --against before.vil \
  --workspace /path/to/workspace
```

`before.vil`とworkspaceのdesired stateを比較し、semantic diffをJSONで出力します。`--against`は必須です。
このコマンドは実機をreadせず、ファイル同士を比較します。

## SVG / PDF rendering

```bash
just cornix render \
  --format svg \
  --layer 0 \
  --out keymap.svg \
  --workspace /path/to/workspace

just cornix render \
  --format pdf \
  --layer 0 \
  --out keymap.pdf \
  --workspace /path/to/workspace
```

- `--format`の既定値は`svg`です。
- `--layer`の既定値は`0`です。
- `--out`の既定値は、formatに応じて`keymap.svg`または`keymap.pdf`です。
- 出力はworkspace内の指定pathへ保存され、成功時はそのpathを表示します。

PDFは外部サービスを使わず、ローカルで1ページのベクターPDFを生成します。

## VILへ書き出す

```bash
just cornix export vil \
  --out keymap.vil \
  --workspace /path/to/workspace
```

`--out`を省略すると`keymap.vil`へ保存します。この操作はファイルを書き出すだけで、実機へwriteしません。

## 更新する

```bash
cd /path/to/cornix-bonsai
git pull
```

更新後も`just cornix ...`から実行します。systemのNode.jsを直接使わず、direnv済みshellまたは
`nix develop`内の固定されたtoolchainを使ってください。
