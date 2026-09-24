# Web UIはGitHub Pagesをやめ、cloneしたリポジトリから`just ui`で起動する

状態: 採用

## 背景

2026-09-24に、Mac内蔵キーボードの適用をWeb UIから行う設計（ADR 0034）を詰める過程で、
配布の前提を見直した。

ADR 0020はWeb UIをGitHub Pagesで配信し、CLIはcloneしたリポジトリで実行すると決めた。
Web UIからMacの設定を適用するには、`karabiner.json`を書き`karabiner_cli`を呼ぶNode側の処理が
要る。Pages版はそれを持てないため、Pages版とローカル版の2つのモードをWeb UIが抱えることになる。

利用者は本人だけで、マシンは複数ある。Macへの適用のために、どのマシンにもcloneとNix環境が
既にある。Mac側のdesired stateはこのリポジトリ直下に置き（ADR 0028）、マシン間の同期はGitで行う。

## 選択肢

1. Pagesをやめ、cloneしたリポジトリから`just ui`でローカルサーバーを起動する
2. Pagesを残し、Web UIに「サーバーあり / なし」の2つのモードを持たせる
3. npxまたは`curl | sh`で配布する

## 決定

案1を採る。

- `just ui`は`vite build`のあと、`src/server/main.ts`のNodeサーバーを起動する。
  サーバーは`dist/`の配信だけを持ち（本ADR）、Macの適用APIを足す（ADR 0034）
- 配信は`http://127.0.0.1:5178/`に固定する。**portは固定し、使用中なら起動を止める。**
  空いているportへ逃がさない
- 起動したらChromeで開く。開けなければURLの表示だけで済ませる
- Viteの`base`は`/`へ戻す。`deploy.yml`は削除する
- Vite開発サーバー（`just dev`）はUI開発用に残す。日常の起動には使わない
- 更新は`git pull`のあと`just ui`を起動し直して受け取る

## 理由

- **2つのモードを持ち続けない。** 案2はサーバーの有無でボタンの出し分けや案内を分岐させ、
  それを維持し続ける。Pages版の利点「cloneせずにURLで使える」が効くのはリポジトリを
  持たない利用者だけで、今はいない
- **originが1つになる。** workspaceの権限とテーマはorigin単位で保存される（ADR 0020）。
  Pagesとlocalhostを併用すると保存が2か所に分かれる。portもoriginの一部なので、
  固定しなければ起動のたびに保存が消える。portが埋まるのは多くが二重起動なので、止めて
  知らせれば足りる
- **画面とNode側の処理が同じcheckoutから作られる。** 起動のたびにbuildするので、Pagesの
  最新版と手元のCLIで版がずれることが起きない
- **案3は置き場所とrelease運用を決め直す。** npxも`curl | sh`もツールをリポジトリの外へ
  出すため、リポジトリ直下のdesired state（ADR 0028）の置き場所を決め直す必要がある。
  npm publishやrelease成果物のCI、Node本体の配布も要る。ADR 0020がnpm publishを見送った
  理由（本人の複数マシンだけならcloneと`git pull`で足りる）は変わっていない
- **開発サーバーを日常に使わない。** Vite開発サーバーはソースツリーを配る作りで、
  ADR 0034で`karabiner.json`を書けるAPIを同じプロセスへ置く。配るのはbuild成果物だけに絞る

## 影響

- ADR 0020のうち、Pages配信、`base: /cornix-bonsai/`、リロードで更新を受け取る点を本ADRで
  改訂する。buildの識別（commit SHAとbuild時刻の表示）、Service Workerを入れない判断、
  CLIをnpm publishしない判断は変えない
- 公開中のPagesサイトはdeployが止まり、以後更新されない。サイトの非公開化はrepository
  Settingsの操作なので、コード変更には含めない
- Web UIの利用にもcloneとNix環境が要る。Macへ適用するために既に必要なので、本人の運用では
  負担は増えない
- 起動のたびにbuildするため、開くまで数秒待つ
- ネットワークが無くても起動できる
- 本人以外の利用者を想定するようになったら、ツールとdesired stateの分離とあわせて配布を
  設計し直す
