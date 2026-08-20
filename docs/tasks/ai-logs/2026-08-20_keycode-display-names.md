# raw keycode式の表示名

## 判断

Anyキー由来かどうかはrawデータから確定できないため、任意のraw keycode式をキーにしたworkspace共通の
表示名を`cornix/labels.yaml`へ保存する。表示名は実機状態・validation・diff・Apply入力から分離する。

## 実施

- `labels@2`の`keycodes` mapと`labels@1`後方互換を実装
- KeyPanelから表示名を編集し、labels専用save queueで保存
- Keymap、picker、Overview、Behaviors、References、Apply、SVG/PDFで表示名を利用
- Applyと書き出しではraw式を併記して安全確認を維持
- parser、表示関数、rendererの回帰テストを追加

## 検証

- `nix develop -c just test`: 150 passed
- `nix develop -c just typecheck`: passed
- DocBridge / lint / build は作業完了時に実行する
