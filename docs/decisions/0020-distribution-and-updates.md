# GitHub PagesでWeb UIを配布し、commit SHAでbuildを識別する

状態: 採用

## 背景

Cornix BonsaiはMVPのWeb UI、CLI、WebHID adapterが揃っているが、利用者がブラウザから使うための
配布先と更新手順が未決定だった。利用者は本人の複数マシンでWeb UIとCLIを使い、実機へwriteする
操作では、どのbuildを使っているかを後から識別できる必要がある。

Web UIはVialと同じくURLを開いて使える形にする。対象browserはADR 0004 / 0007で確定したChromium系で、
WebHIDとFile System Access APIはHTTPSまたはlocalhostのsecure contextで利用できる。keymap.yamlなどの
本体データはFile System Access APIで利用者のローカルfilesystemへ保存しているため、配信元の変更で失われない。
一方、workspace directory handleのIndexedDB保存とテーマのlocalStorage保存はorigin単位なので、localhostから
Pagesへ移る利用者はworkspaceを1回選び直す必要がある。

## 選択肢

1. GitHub Pagesでproject siteとして配信する
2. Cloudflare Pagesなど別のホスティングへ配信する
3. ローカル開発サーバー起動のままにする
4. デスクトップアプリ化する

## 決定

- Web UIは `https://salan70.github.io/cornix-bonsai/` へGitHub Pagesで配信する。
- mainへのpushまたはworkflow_dispatchを契機にGitHub Actionsでinstall、typecheck、test、buildを実行し、
  成功したPages artifactをdeployする。
- Viteのbaseは `/cornix-bonsai/` とする。build時にcommit SHAとbuild時刻を埋め込み、headerのbrand横に
  `build`ラベル、短いcommit SHA、利用者のローカルtimezoneで整形したbuild時刻を可視表示する。
  build時刻は`time`要素の`dateTime`へISO文字列を保持する。
- 更新はブラウザのリロードで受け取る。Service Worker、PWA、オフライン対応は導入しない。
- CLIはnpm publishせず、リポジトリをcloneした環境で `just cornix ...` を実行する。
- routerは導入しない。tabの状態をURLへ載せる判断はADR 0013のまま据え置く。

## 理由

リポジトリはpublicなのでGitHub Pagesを追加アカウントやsecretなしで利用でき、ActionsのOIDCでdeployできる。
Viteのasset hashとPagesのindex.html取得を使えば、Service Workerの古いcacheが更新を隠す問題を持ち込まずに済む。
PagesのHTMLはmax-age=600のため、pushからリロードへの反映は最大10分程度になりうるが、この遅延は許容する。

CLIをnpm publishするにはprivate設定、version採番、tag、publish workflow、配布用buildなど別のrelease運用が必要になる。
現在の利用者は本人の複数マシンに限られ、CLIを実行するときはterminal上にいるため、clone後に `git pull` する運用で十分である。

## 影響

- `salan70.github.io` は本人の他のGitHub Pages siteとoriginを共有する。IndexedDB名 `cornix-bonsai` と
  localStorage key `cornix-bonsai.theme` は名前空間化済みだが、WebHIDのdevice permissionはorigin単位である。
- カスタムドメインへ移す場合はViteのbaseを `/` へ戻す必要がある。
- ネットワークが無いとPages版は起動できない。オフラインで実機を扱う必要が生じたら、ローカルbuildへ切り替える。
- ADR 0013の「URLを共有する相手がいないlocal tool」という前提は部分的に変わる。ただし、reload時にworkspaceの
  再選択が必要な状態と噛み合わないため、tabをURLへ載せない判断は維持する。
- GitHub repository SettingsのPages SourceをGitHub Actionsへ変更する操作は、アカウント設定なのでコード変更には含めない。
