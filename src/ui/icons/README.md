# 機能アイコン

出典は salan70/uiux-numa `5215a3c` の `experiments/cornix-ui-icons/` である。
`squircle/` は `variants/keycap-squircle/dist/*.svg`、`dish/` は `variants/keycap-dish-fill/dist/*.svg` をそのまま写した。
2 組の違いは、天面の凹みを淡い面（`fill-opacity` 0.1）で塗るかどうかだけである。

このディレクトリの SVG は直接編集しない。
形を変えるときは uiux-numa 側で描き直してから写し直す。
`<title>` と `id` は `Icon` が読み込み時に外すため、写すときに消さない。
採用の経緯は `docs/decisions/0032-keycap-icons.md` にある。
