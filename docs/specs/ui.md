# Web UI

UIはVite + React + TypeScriptで、外部router/storeを持たない。mutableなkeymap stateは
`VilDocument`を1つだけ持ち、編集はCoreの純関数へ委譲する。

<!-- @code src/ui/browser-workspace.ts#pickWorkspace -->
<!-- @code src/ui/browser-workspace.ts#restoreWorkspace -->

## Workspace入口

File System Access APIでdirectoryを選択し、directory handleをIndexedDBへ保存する。reload後は
権限が`granted`なら再選択なしに復帰し、keymapの保存時はworkspace adapterの競合検出を通す。
headerにはdevice接続状態、current/desired UID、definition bindingの一致状態を表示する。

## 4 tab

常設header、`Keymap` / `Overview` / `Behaviors` / `References`の4 tab、status barを置く。
Keymapはdefinitionの座標をHTML/CSSの絶対配置へ投影し、encoderを専用帯へ分ける。選択中の
key / encoderのraw keycodeをside panelで編集し、盤面は方向キー、Enter、Escで操作できる。
keycapはlayer名、macOS modifier記号、Tap/Hold roleを優先表示する。BehaviorsはTap Dance / Combo / Settingsを直接編集して保存する。Apply warningの
acknowledge IDは`cornix/acknowledgements.json`へ保存し、内容が変わった診断は再確認を要求する。
Referencesはdynamic entryのusages / unusedと、layerのunreachableを診断一覧と分けて表示する。
Settingsの表示はCornix LP公式firmware V1.12で確認したqsid辞書を使い、辞書にないqsidは
`qsid N`のraw表記を残す。保存形式とvalidationは常にqsidを正とする。
Applyだけは他tabへ移れない線形modalとして扱い、backup、差分、人間確認、write+verify、結果の
順序を崩さない。`backup復元`は最新の`.vil` backupをdesiredへ読み込み、通常のdiffとApply経路へ
戻す。
Applyが全operationのverifyを終えたら実機をfull readし直し、currentとdesiredが一致した状態へ
収束させる。反映済みの差分を残したままにすると、同じApplyをもう一度開始できてしまう。
