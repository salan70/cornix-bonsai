# workspace は keysync リポジトリに固定し、Web UI はローカルサーバー経由で読み書きする

状態: 採用

2026-09-26 に、Web UI で workspace を選ばせる理由が無くなったことを確かめて決めた。

## 背景

Web UI は起動のたびに、File System Access API で選んだ directory を workspace にしている（ADR 0007）。
選ぶ手段がこれしか無かったのは、Web UI がブラウザだけで動く前提だったためである。

この前提は崩れている。

- ADR 0033 で、Web UI は `just ui` が起動するローカルサーバーから配るようになった。
- Mac の desired state は keysync リポジトリ自身が持つ（ADR 0028）。サーバーはその場所を知っている。
- ブラウザは開いた directory の絶対 path を知らない。サーバーと同じファイルを見ているかは digest で確かめている（ADR 0034）。違う directory を選ぶと適用できない。
- Cornix LP の `keymap.yaml` は、まだどこにも作られていない。任意の場所に置ける利点を使う workspace が無い。

ADR 0007 が local service を退けた理由は「常駐 process は配布物とライフサイクル管理を増やす」だった。
その process は ADR 0033 ですでに存在する。

## 選択肢

1. Cornix と Mac の workspace を keysync リポジトリに固定し、Web UI はサーバーの API でファイルを読み書きする
2. Mac だけをサーバー経由にし、Cornix はこれまでどおり directory を選ぶ
3. 今のまま、Web UI で keysync リポジトリを選んでもらう

## 決定

案 1 を採る。

- **workspace は 1 つ。** 優先順は `--workspace` > `$KEYSYNC_WORKSPACE` > keysync リポジトリの root とする。Web UI、`just ui`、CLI の全サブコマンドが同じ規則で決める。CLI の `mac` 以外が cwd を既定にしていたのをやめる
- **Web UI は directory を選ばない。** 起動するとサーバーの workspace を開く。directory handle の IndexedDB 保存と、権限の再確認はなくす
- **ファイルの読み書きはサーバーの API が行う。** 読み、書き、stat、directory 作成の 4 つだけを置く。path は workspace root からの相対 path で、`..` や絶対 path は拒否する。触れられるのは workspace の配置（`keymap.yaml`、`mac-keyboard*.yaml`、`keysync/`、`cornix/`）だけにする
- **`just dev` も同じ API を持つ。** Vite の開発サーバーへ同じ handler を middleware として載せ、origin は `http://127.0.0.1:5173` に固定する
- **Mac 適用の digest 照合は残す。** 画面の内容とディスクの一致を確かめる役目が残るためである。保存の途中や、外部エディタや Git で書き換えた後に古い画面から適用するのを止める

## 理由

- **案 1 は「どこを見ているか」を 1 か所で決める。** ADR 0028 が Mac で解いた問題と同じで、既定を暗黙に効かせる代わりに、Web UI の header と `mac` の出力へ解決済みの path を出す
- **案 2 は workspace が 2 つに割れる。** `keysync/labels.yaml` や `keysync/generated/` の置き場が Cornix と Mac で分かれ、選んだ directory にも Mac の復旧カードが出続ける
- **案 3 は失敗の原因を残すだけである。** 選ぶ手間、権限の再確認、違う directory を選んだときの digest 不一致が、何の選択肢も生まずに残る
- **API の防御は ADR 0034 のヘッダー検査で足りる。** 守る相手はブラウザで開いている別のサイトである。同じユーザーの別 process はファイルを直接書ける。path を配置に限るのは、Web UI の不具合で repository の他のファイルを書き換えないためである
- **CLI の cwd 既定をやめる。** `just keysync` が repository root で走るのは justfile の副作用で、これに頼ると ADR 0028 の問題が Cornix 側に残る

## 影響

- ADR 0007 の「local service を置かない」「workspace はユーザーが選んだ 1 つのディレクトリ」を本 ADR で改訂する。content-addressing、配置、file watching を持たないことは変えない
- ADR 0020 と ADR 0033 の「workspace の権限は origin 単位で保存される」は当たらなくなる。port を固定する理由はテーマと WebHID の device 権限だけになる
- ADR 0028 の「既定が変わるのは `mac` だけ」を本 ADR で改訂する
- Web UI は `just ui` か `just dev` で起動したサーバーが無いと workspace を開けない。静的ファイルだけを配る方法では使えない
- workspace を別の場所で試すときは、`KEYSYNC_WORKSPACE` を付けてサーバーを起動し直す
- `keymap.yaml` と `keysync/definitions/` は keysync リポジトリの Git 管理対象になる
- API の本文の上限を 16 KiB から 16 MiB に上げる。書き出す PDF と definition が載るためである
