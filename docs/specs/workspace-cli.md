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

## 表示用labels

`cornix/labels.yaml`は実機へ送らない表示用sidecarである。layer名に加えて、Anyキーなどのraw keycode式へ
workspace共通の表示名を付けられる。表示名のkeyはraw式の完全一致で、keymapのraw値やvalidation、diff、
Applyの入力には影響しない。

`labels@1`はlayer名だけのlegacy形式として読み込み、保存時は`labels@2`へシリアライズする。

```yaml
schema: cornix-bonsai/labels@2
layers:
  0: "Base"
keycodes:
  "LCG(KC_Q)": "アプリ終了"
```

<!-- @code src/workspace/labels.ts#parseLabelsYaml -->
<!-- @code src/workspace/labels.ts#serializeLabelsYaml -->
<!-- @code src/workspace/labels.ts#keycodeLabel -->

## 表示名の仕様

表示名はUIのKeyPanelから編集し、空欄でそのraw式のentryを削除する。名前が無い場合はkeycodeの既定表示へ
fallbackする。SVG/PDFでは名前とraw式を併記する。

<!-- @code src/workspace/layout.ts#definitionDigest -->

## definitionDigest

definitionのcontent-addressingに使う唯一のdigestである。JSONとして読んでキーを辞書順へ
揃え、2 space整形 + 末尾改行にした表現のSHA-256を取る（ADR 0007）。

`.vil` importと実機full readはどちらもこの関数を通し、workspaceへもcanonical表現で書く。
raw bytesを対象にすると、firmwareが配るpayloadとGit管理下のdefinitionが同じ内容でも
整形の違いだけで別digestになり、実機接続時にdefinition mismatchでApplyが止まる。

<!-- @code src/workspace/layout.ts#readDefinitionBinding -->

## readDefinitionBinding

`keymap.yaml`のdefinition pathがdigestから導出したcontent-addressed pathと一致すること、
実ファイルのdigestがbinding digestと一致することをBrowser / CLIの両方で検証する。
不一致や欠落はdefinitionを解釈せずエラーにする。

<!-- @code src/workspace/types.ts#writeTextIfUnchanged -->

## 外部変更競合

保存直前に現在のstatを取得し、読み込み時のtokenとcontent hashまたはmtimeが異なれば上書き
しない。file watchingは行わず、ユーザーの明示的な再読み込みで外部変更を取り込む。

<!-- @code src/workspace/save-queue.ts#createSaveQueue -->

## 保存の直列化

UIの編集state更新とfilesystemへのwriteを分ける。編集は入力ごとにstateへ即時反映し、
writeはこのqueueが1本の列で行う。競合検査に使うtokenは、成功したwriteごとにqueueだけが
更新する。

入力ごとに非同期saveを並行させると、先行saveの書き込みを後続saveが外部変更と誤検出するか、
同じtokenで競合検査を通った複数のwriteの順序が入れ替わり、古い内容が最後に残る。

待ち中の内容は常に最新の1つへ畳む。中間状態は捨ててよいが、最後の入力は必ず残る。
競合を検出した時点で待ち中の予約も捨て、取り込みは明示的な再読み込みに任せる。

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
