# Web UI

UIはVite + React + TypeScriptで、外部router/storeを持たない。mutableなkeymap stateは
`VilDocument`を1つだけ持ち、編集はCoreの純関数へ委譲する。

<!-- @code src/ui/browser-workspace.ts#pickWorkspace -->
<!-- @code src/ui/browser-workspace.ts#restoreWorkspace -->

## Workspace入口

File System Access APIでdirectoryを選択し、directory handleをIndexedDBへ保存する。reload後は
権限が`granted`なら再選択なしに復帰し、keymapの保存時はworkspace adapterの競合検出を通す。
headerにはdevice接続状態、current/desired UID、definition bindingの一致状態を表示する。

<!-- @code src/workspace/bootstrap.ts#planWorkspaceInit -->
<!-- @code src/workspace/bootstrap.ts#writeWorkspacePlan -->

## Workspace初期化

`keymap.yaml`が無いdirectoryは、実機のfull readから`keymap.yaml`と
`cornix/definitions/<digest>.json`を作って成立させる。CLIの`import vil`と同じ組み立てを
browser側で行うもので、実機へは書き込まない。definitionを先に書き、途中で中断しても
「bindingが指す先が無い」状態を作らない。

<!-- @code src/workspace/bootstrap.ts#planBindingMigration -->

## 旧bindingの移行

definitionのcontent-addressingはcanonical表現のSHA-256で行う。この規則より前に作られた
workspaceはファイルのbytesをそのままdigestしているため、`readDefinitionBinding`が
digest不一致で落ちる。

保存されているbytesのdigestが`keymap.yaml`のdigestと一致することは、definitionが記録当時と
同じ内容である証明になる。この場合に限り、実機も`.vil`も使わずbindingをcanonical規則へ
移行できる。一致しない場合は移行しない。digest不一致はkeymapとdefinitionの取り違えの検出
手段でもあるため、移行は自動では行わずユーザーの明示操作にする。

UIは読み込み失敗を例外の文字列のまま出さず、`keymap.yaml`が無い場合・旧bindingの場合・
それ以外を区別して、それぞれの復旧操作を提示する。

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
