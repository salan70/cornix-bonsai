# Local server

`just ui`が起動するローカルサーバーの仕様です。
判断はADR 0033（配布をローカルサーバーへ寄せる）とADR 0034（Macの適用API）にあります。

サーバーは`src/server/`にあり、Nodeで動きます。
Web UIのコード（`src/ui/`）からは呼び出さず、HTTPだけで接続します。

<!-- @code src/server/main.ts#createUiServer -->

## createUiServer

`dist/`を配信し、`/api/`配下を適用APIへ渡すHTTPサーバーを作ります。
listenは呼び出し側が行います。
`/api/`配下は`rejectApiRequest`を通ったものだけを渡します。
本文は16 KiBまでで、JSONとして読めなければ400を返します。

| 項目   | 値                                                     |
| ------ | ------------------------------------------------------ |
| bind   | `127.0.0.1`だけ。LANからは届かない                     |
| port   | `5178`で固定。使用中なら理由を出して終了する           |
| method | 静的配信は`GET`と`HEAD`だけ。それ以外は405             |
| 起動後 | `open -a "Google Chrome"`で開く。失敗してもURLだけ表示 |

portを固定するのは、originにportが入るためです。
変わるとworkspaceの権限とテーマの保存が起動のたびに消えます。

<!-- @code src/server/static.ts#serveStatic -->

## serveStatic

URLのpathを`dist/`配下のファイルへ解決して読みます。
`/`は`index.html`です。

- `dist/`の外を指すpath（`..`や符号化した区切り）は404にします。
- 配信する拡張子は`vite build`が出すものだけで、それ以外は404にします。
- `index.html`は`no-cache`、hash付きのassetは`immutable`で返します。
  起動し直した後のreloadで新しいbuildが必ず見えるようにするためです。

<!-- @code src/server/guard.ts#rejectApiRequest -->

## rejectApiRequest

`/api/`配下へのリクエストを、ヘッダーだけで受けるか決めます（ADR 0034）。
拒否すると403と`{kind: "rejected", reason}`を返します。

| 確認             | 条件                                        | 防ぐもの        |
| ---------------- | ------------------------------------------- | --------------- |
| method           | `POST`だけ                                  | —               |
| `Content-Type`   | `application/json`だけ                      | form からの送信 |
| `Host`           | `127.0.0.1:5178`と一致                      | DNS rebinding   |
| `Origin`         | `http://127.0.0.1:5178`と一致。無ければ拒否 | CSRF            |
| `Sec-Fetch-Site` | `same-origin`だけ                           | CSRF            |

守る相手はブラウザで開いている別のサイトです。
同じマシンで同じユーザーとして動く別のプロセスは対象外にします。
そのプロセスは`karabiner.json`を直接書けるので、APIを守っても防げません。
起動ごとのトークンを持たないのはこのためです。

<!-- @code src/server/mac-api.ts#createMacApi -->
<!-- @code src/server/protocol.ts#MAC_API -->

## createMacApi

Macの適用APIです。
手順はCLIと同じ`src/mac/apply-service.ts`を通ります（`mac-keymap.md`の「適用の境界」）。
呼び出しは1本ずつ直列に処理します。

| path              | 本文                            | 行うこと                                        |
| ----------------- | ------------------------------- | ----------------------------------------------- |
| `/api/mac/status` | `{}`                            | このマシンの内蔵配列とworkspaceを返す           |
| `/api/mac/plan`   | `{layout, digest}`              | 計画を組み、差分とfingerprintを返す             |
| `/api/mac/apply`  | `{layout, digest, fingerprint}` | 計画を組み直し、fingerprintが一致したら適用する |
| `/api/mac/select` | `{layout}`                      | profileの切り替えだけをやり直す                 |

計画を組む前に、次の順で突き合わせます。
どれかで止まったら`karabiner.json`には触れません。

1. 編集対象の配列が、このマシンの内蔵配列（`detectBuiltInLayout`）と一致する
2. その配列の設定ファイルがある
3. Web UIが送った`digest`が、ディスクから読んだ設定の`macKeymapDigest`と一致する
4. error診断が無い
5. Karabinerが入っている（CLIと違い、ここで止める）
6. lintが通る

`apply`は計画を組み直し、fingerprintが違えば書かずに新しい計画を`fingerprint-mismatch`で返します。
書き込みとverifyの後にprofileの切り替えだけが失敗したら、巻き戻さずに`select-failed`を返します。
想定外の例外は500と`{kind: "failed", message}`にします。
