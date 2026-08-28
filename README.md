# Cornix Bonsai

Cornix LP向けのキーマップ編集ツール 💚

Cornix Bonsaiは、Cornix LPのキーマップをブラウザ・CLI・Git・AIエージェントから読み取り、編集、検証、可視化、バージョン管理するためのローカルファーストなツールです。

Web UI: <https://salan70.github.io/cornix-bonsai/>

Web UIはChromium系ブラウザ（Chrome / Edge / Brave）が必要です。WebHIDに対応しないSafariとFirefoxでは実機接続を使えません。

## 現在の状況

workspace / CLI / Web UI / WebHID adapterのMVP実装を含みます。mainへのpushはGitHub Pagesへ自動デプロイされ、
headerに利用中buildの短いcommit SHAを表示します。実機USB/BLEの受入確認は実機と人間の明示操作が必要なため、
mock/fixtureの自動検証とは分けて扱います。

## 起動

依存関係とツールチェーンはNix環境を使います。初回のCLI setupではpre-commit / pre-push hookも導入します。

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

### CLI

既存の`.vil`とdefinitionからworkspaceを初期化し、同じCoreで検証・解析・差分・描画・exportを実行できます。
複数マシンでは各マシンでclone後に一度setupし、以後は`git pull`で更新します。CLIはnpm packageとしてpublishせず、
cloneしたリポジトリから実行します。

```bash
git clone https://github.com/salan70/cornix-bonsai.git
cd cornix-bonsai
direnv allow
just setup

just cornix import vil fixtures/cornix-lp/baseline.vil \
  --definition fixtures/cornix-lp/vial-definition-v1.12.json \
  --workspace /path/to/workspace
just cornix validate --workspace /path/to/workspace
just cornix analyze --workspace /path/to/workspace
just cornix diff --against before.vil --workspace /path/to/workspace
just cornix render --format svg --out keymap.svg --workspace /path/to/workspace
just cornix render --format pdf --out keymap.pdf --workspace /path/to/workspace
just cornix export vil --out keymap.vil --workspace /path/to/workspace

# 更新時
git pull
```

### Browser UI

`just dev`で起動し、Chromium系browserでworkspace directoryを選択します。permission済みの
directory handleはIndexedDBへ保存され、reload後に復帰します。`接続` → `実機read` → 編集 →
`Apply`の順に操作します。`.vil`読込はdesired stateへ反映し、OverviewのSVG/PDF書出とVIL書出は
workspaceの`cornix/generated/`へ保存します。Applyはbackup、validation、差分確認、人間確認、
single-entry write、再read verifyの順で進みます。電源断後のflash durabilityは通常の成功条件に含めません。

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
