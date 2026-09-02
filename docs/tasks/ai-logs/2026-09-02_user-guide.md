# Web UI・CLI利用者ガイドの整備

## Fact

- READMEは開発環境の起動例と利用者操作を兼ね、Browser UIの説明は1段落だけだった。
- `docs/`はADR、実装仕様、作業ログが中心で、利用者向けの独立した入口が無かった。
- Web UIにはworkspace初期化、4 tab、診断、VIL入出力、SVG/PDF出力、backup復元、Safe Applyが実装済みである。
- CLIは`validate`、`analyze`、`diff`、`render`、`import vil`、`export vil`を提供し、実機write commandを持たない。
- 利用者向け文書はWeb UIとCLIの両方を対象とし、画像を使わず、macOS + Chrome / Chromiumを確認済み環境とする方針が承認された。

## Decision

- `docs/user-guide/`を利用者向け文書の正本とし、実装と1:1で対応する`docs/specs/`から分離した。
- クイックスタート、Web UI、CLI、Safe Apply、workspace・用語、トラブル対処の6文書に分け、共通説明は相互linkで参照する。
- READMEをWeb UIと利用者ガイドへの入口にし、開発環境の詳細と利用者操作を分離した。
- 1280px幅でheaderへのlink追加を検証すると横overflowが1445pxまで増えたため、GitHub上の利用者ガイドを新しいtabで開くlinkは4 tab navigationの右端へ置いた。既存の固定操作とテーマ選択の配置は変えていない。
- readとApply、desired stateとcurrent state、直後のverifyと電源断後の永続性を区別して説明した。

## Validation

- `nix develop -c just lint`: oxlint、oxfmt、markdownlint、typecheck、DocBridgeが成功。
- `nix develop -c just typecheck`: 成功。
- `nix develop -c just test`: 187 tests passed。
- `nix develop -c just build`: Vite production build成功。
- `nix develop -c just docbridge-check`: 0 errors、0 warnings。
- 一時workspaceでCLIの`import vil`、`validate`、`analyze`、`diff`、SVG/PDF render、`export vil`を実行し、すべて終了コード0。diffは0件で、SVG、1 page PDF、VILを生成した。
- ローカルWeb UIで利用者ガイドlinkが1件だけ表示され、文言、GitHub URL、`target="_blank"`、`rel="noreferrer"`、console error 0件を確認した。1280px幅でtab navigationの`clientWidth`と`scrollWidth`はともに1280pxで、linkはviewport内に収まった。
- 利用者の指定に従い、スクリーンショットは作成していない。実機read・Apply・writeも行っていない。

## DocBridge Sync判断

related gateは`docs/specs/ui.md`を変更したため、同ファイルの36 counterpartを未更新として報告した。
変更した契約は未linkの`4 tab` sectionにある利用者ガイドlinkだけで、対応するnavigation実装と同時に更新済みである。
DocBridge上の`Header and status`を含むlink済みsectionは本文も公開endpointも変えていないため更新不要と判断した。
theme、workspace、Keymap、picker、診断、Apply、Overview、import/export、Behaviors、References、復旧の各sectionは
本文も対応コードも変更しておらず、残りのcounterpartも更新不要と判断した。

## Open Question

- 新規文書は未pushなので、navigationのGitHub URLは現時点のorigin/mainでは404になる。UIと文書を含むcommitがpushされた後に公開先で到達確認が必要である。
