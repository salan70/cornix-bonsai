# workspace は KEYSYNC_WORKSPACE で必ず指定し、keysync リポジトリには置かない

状態: 採用

2026-09-26 に、ADR 0038 で keysync リポジトリへ寄せた設定の置き場を見直して決めた。

## 背景

ADR 0038 で、workspace の既定を keysync リポジトリの root にした。
Mac 内蔵キーボードの設定を初めて Karabiner へ適用した後、`mac-keyboard.ansi.yaml` をどこで commit するかが論点になった。

- keysync リポジトリに commit すると、ツールのコードと利用者のキーマップの履歴が混ざる。
- 利用者は、ほかのマシン設定と同じく dotfiles でキーマップを管理したい。
- `$KEYSYNC_WORKSPACE` で別の場所を指せる仕組みは、ADR 0028 からある。

## 選択肢

1. `$KEYSYNC_WORKSPACE` を必須にし、未設定なら止める
2. `$KEYSYNC_WORKSPACE` を優先し、未設定なら keysync リポジトリの root へ倒す
3. keysync リポジトリに置いたまま、dotfiles から symlink する

## 決定

案 1 を採る。

- **workspace は `--workspace` か `$KEYSYNC_WORKSPACE` でだけ決まる。** どちらも無ければ、CLI とローカルサーバーは理由を出して止まる
- **keysync リポジトリは利用者の設定を持たない。** root の `mac-keyboard.ansi.yaml` は管理対象から外す
- **場所を決めるのは利用者の環境である。** この利用者は dotfiles の `config/keysync/` を workspace にし、dotfiles の zsh 設定が `$KEYSYNC_WORKSPACE` を export する
- ADR 0038 の残りの決定（Web UI は directory を選ばない、ファイルはサーバーの API で読み書きする、CLI と Web UI で同じ規則を使う）は変えない

## 理由

- **案 1 は置き場所を 1 つに保つ。** 案 2 では、変数を付け忘れた起動で keysync リポジトリの root に設定が作られる。Git 管理されない 2 つ目の置き場所ができ、ADR 0028 が解いた「どこを見ているか分からない」が戻る
- **案 3 は symlink の張り方がマシンごとの手順になる。** さらに、keysync リポジトリの `.gitignore` に利用者のファイル名を並べ続けることになる
- **必須にしても日常の手間は増えない。** 変数は dotfiles がシェルの起動時に設定する。fixture を使う CLI と test は、これまでどおり `--workspace` を渡す

## 影響

- ADR 0038 の「workspace は keysync リポジトリに固定する」と、ADR 0028 の「既定は keysync リポジトリの root」を本 ADR で改訂する
- clone しただけの環境では、`just ui` も `just keysync` も `KEYSYNC_WORKSPACE` の設定を案内して止まる
- `KEYSYNC_WORKSPACE` はシェルから `just` へ引き継がれる。シェルを経ずに起動する経路は今は無い
- workspace の生成物（`keysync/backups/`、`keysync/generated/`）を Git から外す設定は、workspace 側が持つ
