# CLI の使い方

CLI は Web UI と同じ Core を共有します。
設定の検証、解析、差分計算、ファイル生成を行います。
CLI には Cornix LP への実機書き込み機能はありません。
MacBook 内蔵キーボードの設定のみ、CLI から差分確認と適用を行えます。

## サブコマンド一覧

| コマンド     | 対象      | 主な用途                                              |
| ------------ | --------- | ----------------------------------------------------- |
| `validate`   | Cornix LP | workspace 設定の構文や整合性を検証します。            |
| `analyze`    | Cornix LP | レイヤーの到達性や未参照の項目を解析します。          |
| `diff`       | Cornix LP | 指定した `.vil` と workspace の意味差分を表示します。 |
| `render`     | Cornix LP | レイヤー図面を SVG または PDF 形式で書き出します。    |
| `import vil` | Cornix LP | `.vil` と定義から workspace を新規生成します。        |
| `export vil` | Cornix LP | workspace の設定を `.vil` 形式で書き出します。        |
| `mac`        | Mac 内蔵  | Karabiner 設定の生成、差分確認、適用を行います。      |

## セットアップ

CLI は clone したリポジトリの Nix 環境から実行します。

```bash
git clone https://github.com/salan70/cornix-bonsai.git
cd cornix-bonsai
direnv allow
just setup
```

direnv を使わない場合は、先に `nix develop` へ入ってから実行してください。

## 共通規則

基本書式は次のとおりです。

```text
just cornix <command> --workspace <directory>
```

- `--workspace` を省略すると、カレントディレクトリを対象にします。
- 相対パスは workspace ディレクトリを基準に解決されます。
- エラー時は標準エラーへ理由を出力し、終了コード 1 を返します。
- `validate` と `analyze` は、エラーがあれば終了コード 1、無ければ 0 を返します。

## Cornix LP 向けコマンド

### VIL から workspace を新規作成する

`.vil` と定義ファイルを読み込み、workspace を作成します。

```bash
just cornix import vil baseline.vil \
  --definition vial-definition.json \
  --workspace /path/to/workspace
```

既存ファイルがある場合は上書きされるため、実行前に Git の状態を確認してください。
成功時は作成された `keymap.yaml` のパスを表示します。

### 設定の検証（validate）

workspace の設定を検証し、診断結果を JSON で出力します。

```bash
just cornix validate --workspace /path/to/workspace
```

警告のみの場合は終了コード 0、エラーが 1 件以上ある場合は 1 を返します。
CI や Git フックでの検証に適しています。

### 参照と到達性の解析（analyze）

各レイヤーへの到達性や、参照関係のエッジを解析します。

```bash
just cornix analyze --workspace /path/to/workspace
```

到達できない孤立レイヤーや、未使用の動作定義の検出に使用します。

### VIL との差分計算（diff）

指定した `.vil` と workspace の設定を比較し、意味差分を出力します。

```bash
just cornix diff \
  --against before.vil \
  --workspace /path/to/workspace
```

実機との通信は行わず、ファイル同士の意味差分を計算します。
`--against` オプションは必須です。

### 図面の出力（render）

キーマップ図面をベクター形式（SVG または PDF）で生成します。

```bash
# SVG の出力
just cornix render --format svg --layer 0 --workspace /path/to/workspace

# PDF の出力
just cornix render --format pdf --layer 0 --workspace /path/to/workspace
```

- `--format`: `svg` または `pdf`（既定値: `svg`）。
- `--layer`: 出力対象のレイヤー番号（既定値: `0`）。
- `--out`: 出力ファイル名（既定値: `keymap.svg` または `keymap.pdf`）。

PDF は外部ツールを使わず、ローカルで高品質なベクター PDF を生成します。

### VIL への書き出し（export vil）

workspace の設定を `.vil` ファイルへ書き出します。

```bash
just cornix export vil --out keymap.vil --workspace /path/to/workspace
```

ファイルを生成するのみで、実機へは書き込みません。

## MacBook 内蔵キーボード管理（mac）

Mac のキーボード設定は、Karabiner-Elements を介して管理します。
設定は `mac-keyboard.<layout>.yaml` へ保存されます。
実行中の Mac の配列（JIS または ANSI）を自動検出し、対応するファイルを処理します。
Browser UI は配列を検出しません。
ドロップダウンで選んだファイルを編集し、適用とデバイス追加は本コマンドだけが行います。

### 適用先デバイスの一覧・登録（devices）

Karabiner が認識しているキーボードを一覧表示します。

```bash
# 一覧表示（ファイルは変更しない）
just cornix mac devices --workspace /path/to/workspace

# 特定のデバイスを設定ファイルへ追加
just cornix mac devices --workspace /path/to/workspace --add 1452:630
```

内蔵キーボードは既定で対象となるため、登録作業は不要です。
外付けキーボードにも同一設定を適用したい場合は `--add` で登録します。

### 設定の生成（generate）

Karabiner 向け complex modifications ファイルを生成します。

```bash
just cornix mac generate --workspace /path/to/workspace
```

出力先は `cornix/generated/` 配下の JSON です。
変換できないキーコードがある場合は生成を中止し、終了コード 1 を返します。

### 差分の確認（diff）

現在の Karabiner 設定と workspace の設定差分を表示します。

```bash
just cornix mac diff --workspace /path/to/workspace
```

ファイルの読み取りのみ行い、書き換えはしません。
Cornix が管理する `Cornix Bonsai` プロファイルのみを比較対象にします。

### 設定の適用（apply）

Karabiner の設定ファイルへ差分を適用します。

```bash
# 差分と確認用 fingerprint を表示
just cornix mac apply --workspace /path/to/workspace

# 表示された fingerprint を指定して実際に適用
just cornix mac apply \
  --confirm v1-xxxxxxxx-xxxxxxxx \
  --workspace /path/to/workspace
```

適用は以下の安全手順で実行されます。

1. 現在の設定をバックアップディレクトリへ退避する。
2. 一時ファイルを作成後、アトミックにファイルを置き換える。
3. 反映後のファイルを再読み込みし、内容の一致を検証する。

Cornix は `Cornix Bonsai` プロファイルのみを変更します。
他のプロファイルや全体設定は変更しません。

## ツール本体の更新

リポジトリを更新した後は、Nix 環境からコマンドを実行してください。

```bash
cd /path/to/cornix-bonsai
git pull
```
