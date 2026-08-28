# Browser UIのimport / exportはworkspaceのgeneratedへ保存する

状態: 採用

2026-08-28、Issue #15のbrowser workflow受入条件を満たすため、既存のCLIと同じCoreを使う
`.vil` import、VIL / SVG / PDF exportの導線を追加する。

## 決定

- `.vil`読込は現在開いているworkspaceの`keymap.yaml`へdesired stateとして反映する。
- 読み込んだdocumentのdefinition bindingはworkspace既存のものを維持する。
- UID、容量、未対応設定などの不整合は通常のvalidation / Apply gateへ委譲する。
- 書出結果はGit管理外の`cornix/generated/`へ保存する。
- SVG / PDFはKeymapで選択中のlayerを、CLIと同じrenderer・座標・表示名規則で書き出す。
- すべての操作はworkspaceファイルだけを変更し、実機writeを開始しない。

## 理由

`keymap.yaml`はGit管理するdesired stateであり、`.vil`を直接実機へ流し込む経路を作ると
Safe Applyの人間確認を迂回する。現在のworkspace bindingを保つことで、import後も同じ
definitionでvalidationとdiffを表示できる。生成物は既存の`cornix/generated/`へ集約し、
desired stateと混在させない。

## 影響

- HeaderからVILの読込・書出を実行できる。
- Overviewから選択中layerのSVG / PDFを書き出せる。
- 別キーボードの`.vil`を読んだ場合も、ApplyはUID mismatchとして停止する。
- browserでのファイル選択に対応しない環境では、対応可能な標準inputへfallbackする。
