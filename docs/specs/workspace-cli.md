# WorkspaceとCLI

workspaceはBrowserのFile System Access APIまたはCLIのローカルディレクトリを入口にする。
`keymap.yaml`がdesired stateで、definitionはSHA-256の先頭16文字を使ったcontent-addressed
pathに保存する。`cornix/acknowledgements.json`はApply warningの確認IDを保持する。
`cornix/backups/`と`cornix/generated/`は生成物で、keymapの競合検出は
mtimeだけでなく読み出したcontent hashを優先する。

<!-- @code src/workspace/layout.ts#WORKSPACE_LAYOUT -->

## 配置

```text
keymap.yaml
cornix/
  definitions/<digest-prefix>.json
  labels.yaml
  acknowledgements.json
  backups/<timestamp>.vil
  backups/latest.vil
  generated/<name>
```

<!-- @code src/workspace/layout.ts#readDefinitionBinding -->

## readDefinitionBinding

`keymap.yaml`のdefinition pathがdigestから導出したcontent-addressed pathと一致すること、
実ファイルのSHA-256がbinding digestと一致することをBrowser / CLIの両方で検証する。
不一致や欠落はdefinitionを解釈せずエラーにする。

<!-- @code src/workspace/types.ts#writeTextIfUnchanged -->

## 外部変更競合

保存直前に現在のstatを取得し、読み込み時のtokenとcontent hashまたはmtimeが異なれば上書き
しない。file watchingは行わず、ユーザーの明示的な再読み込みで外部変更を取り込む。

<!-- @code src/cli/main.ts#main -->

## CLI

同じCore表現を使い、`cornix validate`、`cornix analyze`、`cornix diff --against`、
`cornix render --format svg|pdf`、`cornix export vil`を提供する。`.vil` importは
`cornix import vil <file> --definition <definition.json>`でworkspaceへ初期化する。

<!-- @code src/render/keyboard.ts#renderSvg -->
<!-- @code src/render/keyboard.ts#renderPdf -->

## Rendering

SVGとPDFは同じdefinition由来の物理座標を使う別rendererで、HTML editorのmarkupは共有しない。
PDFは外部サービスへ送らず、CLIが1ページのベクターPDFを生成する。
