# Local server

`just ui`が起動するローカルサーバーの仕様です。
判断はADR 0033（配布をローカルサーバーへ寄せる）にあります。

サーバーは`src/server/`にあり、Nodeで動きます。
Web UIのコード（`src/ui/`）からは呼び出さず、HTTPだけで接続します。

<!-- @code src/server/main.ts#createUiServer -->

## createUiServer

`dist/`を配信するHTTPサーバーを作ります。
listenは呼び出し側が行います。

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
