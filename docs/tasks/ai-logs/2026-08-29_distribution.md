# 2026-08-29 配布とアップデート配信の導入

対象: Issue #17（I-020）

## Fact

- リポジトリはpublicで、既存CIはGitHub Actionsのtypecheck / DocBridge workflowを使っている。
- Web UIはVite + Reactで、対象browserはADR 0004 / 0007によりChromium系に確定している。
- workspaceの本体データはFile System Access APIでローカルfilesystemへ保存し、workspace handleとテーマだけorigin単位のbrowser storageへ保存している。
- CLIはnpm publishされておらず、`package.json`のpackageはprivateである。
- READMEには実在しない`just build`の記述があり、`justfile`にはbuild / dev recipeが無かった。

## Inference

- GitHub Pagesのproject siteは、追加の配布アカウントやsecretを増やさずにpublic repositoryへURL配信できる。
- Service Workerを導入せず、Viteのhashed assetとindex.htmlのリロードに更新経路を限定する方が、更新停止要因を増やさない。
- 現在の利用者数とCLI利用形態では、npm registryのrelease運用よりclone後の`git pull`の方が維持コストが低い。

## Decision

- Web UIの配信先を`https://salan70.github.io/cornix-bonsai/`とし、main push / 手動実行でbuild・test・typecheck後にPagesへdeployする。
- Viteへ`/cornix-bonsai/`のbaseとcommit SHA / build時刻の埋め込みを追加し、headerに短いSHAを表示する。
- `just dev`、`just build`、`just preview`、`just cornix`を追加し、READMEのCLI例をjust経由へ統一する。
- 決定の根拠とorigin / offline / custom domain / routerの影響をADR 0020へ記録した。
- GitHub Pages SettingsのSource変更はアカウント設定なので、コード変更・PRの対象外とした。

## Open Question

- Pagesのrepository Settings → Pages → SourceはGitHub Actionsへ設定済みであることをAPIで確認した。
- Pages URL上の実機read到達、リロードによるSHA更新、Pagesの実際のdeploy成功は、mainへ反映後の環境依存確認として残る。実機writeは行わない。
