# CLIの使い方

CLIはWeb UIと同じCoreを使い、workspaceのvalidation、解析、差分、SVG/PDF rendering、VIL入出力を
行います。CLIにはWebHID接続やCornix LPへの実機writeのコマンドはありません。

MacBook内蔵キーボードの設定だけは例外で、`cornix mac`から適用まで行えます。Karabiner-Elementsの
設定ファイルを書き換えるだけなので、firmwareへは触れません。

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

## Macのキーボード

MacのキーボードはKarabiner-Elementsをengineにして管理します。desired stateはworkspace直下の
`mac-keyboard.<layout>.yaml`で、Cornix LPの`keymap.yaml`とは別のファイルです。片方だけを置いた
workspaceでも動きます。

設定は**物理配列ごと**に持ちます。US配列のMacと日本語配列のMacを両方使う場合は
`mac-keyboard.ansi.yaml`と`mac-keyboard.jis.yaml`を並べて置きます。どちらを使うかは
`cornix mac`が**実行しているMacの内蔵キーボードの配列を検出して**決めます。検出できない場合は
`--layout ansi|jis`を指定してください。別の配列の設定を触りたいときも`--layout`を使います。

1つの設定は同じ配列の複数のキーボードへ効かせられます。内蔵に加えて外付けの純正US
キーボードにも同じ割り当てを使いたい場合は、`mac-keyboard.ansi.yaml`の`devices`へ
両方を書きます。

```yaml
devices:
  - { built_in: true }
  - { vendor_id: 1452, product_id: 630 }
```

`devices`を省略すると内蔵キーボードだけが対象です。

### 適用先のキーボードを調べる・登録する

```bash
just cornix mac devices --workspace /path/to/workspace
```

Karabinerが観測しているキーボードを一覧します。この操作はファイルを書き換えません。
出力の`identifier`が`devices`へ書ける値で、`add`にそのまま実行できるコマンドが出ます。

```bash
just cornix mac devices --workspace /path/to/workspace --add 1452:630
```

`--add`を付けたときだけ設定ファイルへ書き戻します。同じデバイスを二重には足しません。

内蔵キーボードはvendor / product idを申告しないため、一覧に出てもidがありません。
既定で対象なので登録も要りません。

**Cornix LPのような他のキーボードも一覧に並びます。** 登録するとMacの割り当てがその実機の
firmwareの割り当てと二重に効くので、`product`を見て選んでください。

ADR 0027より前に作った`mac-keyboard.yaml`もそのまま読めます。中の`layout`宣言が、どの配列の
設定かを決めます。

事前にKarabiner-Elementsをインストールし、入力監視の権限を与えておいてください。

### 生成する

```bash
just cornix mac generate --workspace /path/to/workspace
```

`cornix/generated/karabiner-complex-modifications.json`へ書き出します。Karabinerが入っていれば
`karabiner_cli --lint-complex-modifications`も通します。Karabinerへ落とせないkeycodeが1つでも
あれば書き出さず、終了コード1を返します。黙って捨てることはありません。

Web UIのMacタブ（「Karabiner assetを書き出す」）も同じファイルを書き出します。
Web UIから適用はできません。

### 差分を見る

```bash
just cornix mac diff --workspace /path/to/workspace
```

`~/.config/karabiner/karabiner.json`を読み、Cornixが所有する`Cornix Bonsai` profileだけを
構造で比較します。`--karabiner <path>`で対象を変えられます。読むだけで書き換えません。

### 適用する

```bash
just cornix mac apply --workspace /path/to/workspace
```

`--confirm`を付けないうちは差分とfingerprintを表示して終わります。中身を確認してから、表示された
fingerprintをそのまま渡します。

```bash
just cornix mac apply \
  --confirm v1-xxxxxxxx-xxxxxxxx \
  --workspace /path/to/workspace
```

適用は次の順で進みます。

1. `cornix/backups/karabiner-<時刻>.json`へ現在の設定をそのまま退避する
2. 一時ファイルへ書いてから`rename`で置き換える
3. 読み直して所有profileが期待どおりかを確認する

Cornixが触るのは`Cornix Bonsai`という名前のprofile 1つだけです。`global`と他のprofile、
どのprofileが選ばれているかは変更しません。Cornix側のprofileが選ばれていない場合はwarningを出すので、
Karabiner-Elementsの設定画面か`karabiner_cli --select-profile 'Cornix Bonsai'`で切り替えてください。

## 更新する

```bash
cd /path/to/cornix-bonsai
git pull
```

更新後も`just cornix ...`から実行します。systemのNode.jsを直接使わず、direnv済みshellまたは
`nix develop`内の固定されたtoolchainを使ってください。
