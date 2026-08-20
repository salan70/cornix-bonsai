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

<!-- @code src/ui/components/index.ts#AppHeader -->
<!-- @code src/ui/components/index.ts#StatusBar -->

## Header and status

headerはCornix Bonsaiのbrand、workspace path、接続状態chipを常設する。artifactの再読み込みと
backup復元ボタンに加えて、WebHIDのuser gestureを必要とする接続・切断・実機readと、workspace
directoryを切り替える操作を同じ行へ置く。接続状態は色だけに頼らず、未接続または製品名を文字で示す。

status barのエラー・警告・情報件数は押下でき、診断panelを開く。差分件数、保存先、Apply導線も
常設し、Applyのgateと診断のseverityをUI表示上で混同しない。

<!-- @code src/ui/components/index.ts#KeymapTab -->
<!-- @code src/render/geometry.ts#keyBox -->
<!-- @code src/render/geometry.ts#boardMetrics -->
<!-- @code src/ui/use-board-scale.ts#useBoardScale -->

## Keymap editor

Keymapはdefinition由来の物理座標をHTML/CSSの絶対配置へ投影する。座標からpxへの投影は
`src/render/geometry.ts`が唯一の定義元で、盤面とOverview、SVG / PDF exportが同じ関数を消費する。
`transform-origin`は要素自身のbox基準で解決されるため、回転中心は盤面座標ではなくキーからの
相対値で渡す。盤面の外接矩形は回転後の四隅から求め、回転したキーがはみ出さない大きさにする。

表示倍率は固定せず、盤面containerの幅から1uを30〜52pxのclampで決め、keycapのfont sizeも
同じ倍率へ連動させる。keycapは2段までで、各段は1行に切り詰めて`…`で畳み、全文はtitleと
side panelで出す。keycodeの語彙に応じたbasic / mod / mod-tap / layer / layer-tap / tapdance /
custom / noneの意味別classを付ける。encoderは物理キーと混ぜず、実機が申告した本数から専用帯を
組み立てる。方向キー、Enter、Escの操作は盤面の選択を保ったまま編集panelへ移動できる。

<!-- @code src/ui/components/index.ts#KeyPanel -->

## Side panel editing controls

選択中のキーまたはencoderは、位置、動作、Tap（単押し）、Hold（長押し）、詳細、参照を右側の
panelへ表示する。動作selectは既存keycodeの分類を使い、キー全体・Tap・Holdの現在値と適用先を
表示する。Tap/Holdの変更は盤面下のkeycode pickerから行い、選択した値は既存のcore編集関数へ
渡す。pickerで表現しきれないcustom、macro、未分類表記のため、raw keycode入力も詳細内に残す。
layerを指すkeycodeは参照先のlayer名と番号を表示する。

<!-- @code src/ui/components/index.ts#KeycodePicker -->
<!-- @code src/ui/keycode-compose.ts#applyPick -->

## Keycode picker

盤面の下にVialのISO/JIS面に合わせた6行の物理配列でkeycodeを常設表示する。mainは各行16uに
揃え、navigationは3uの逆T字、numpadは4uのclusterとして同じ行位置へ置く。ISO Enterの行跨ぎは
再現せず、3段目末尾へ2.25uで置き、4段目末尾はspacerにする。

pickerのキー幅はコンテナ幅と下部ストリップの26uから自動計算し、狭い画面でも横スクロールを
発生させない。main / navigation / numpadのgridとは独立して、下部に`KC_NO`、`KC_TRNS`、shift済み
記号、`LANG1` / `LANG2`を並べる26uのストリップを描く。各キーの表示は共通のkeycode label関数から
描き、`KC_1`のようなbase keycodeはshift済み記号を上段へ併記し、`KC_KP_7`のようなnumpadは
`7`の刻印へ変換する。

適用先はキー全体・Tap・Holdで切り替え、現在値を各ボタンへ併記する。Holdではmodifier keycode
だけを有効にし、選択した値はVial形式の`X_T(kc)`へ組み立てる。キーまたはencoderが未選択なら
gridとストリップを含むpicker全体を無効化する。

<!-- @code src/ui/keycode-labels.ts#keycodeDisplay -->
<!-- @code src/core/keycode/shifted.ts#shiftedOf -->

## Keycode labels

keycodeの表示はwire encode用の表記とは分離し、`SHORT_LABELS`でVialの刻印へ寄せる。numpad、shift
済み記号、JIS固有キー（`JYEN`、`KANA`、`HENK`、`MHEN`、`LANG1`、`LANG2`）は刻印を優先する。
modifier、layer、Tap Danceのrole表記は既存の記号表記を維持する。shift keycodeのbase / shifted
対応はcoreの単一定義元からpickerと盤面keycapの両方へ提供し、ラベル表を複製しない。

<!-- @code src/ui/components/index.ts#DiagnosticsPanel -->

## Diagnostic panel

status barのseverity件数から開く診断panelは400px幅で、icon、severity名、code、message、対象を
各行に表示する。同じcodeの診断は先頭1件を表示し、対象違いの残りをcollapsed行へ畳む。行を選ぶと
対象がkey / encoder / layerの場合はlayerと盤面選択を更新し、編集panelへ戻る。Escまたは「編集
panelへ」で診断panelを閉じる。severityは診断の性質だけで決まり、Applyを止める判断はApply側の
gateに委譲する。

<!-- @code src/ui/components/index.ts#ApplyDialog -->

## Apply modal steps

Applyはbackup、差分確認、確認、書き込み、結果の5 stepをmodal内で表現する。backup行はApply前の
full readの往復回数を示し、差分確認では追加・変更・削除のtag、対象、before/afterの挙動を1行へ
出す。`notationOnly`はcollapsedへ畳むが、書き込み対象であることを明記する。

確認stepのacknowledgeは診断ID単位のcheckboxで、根拠の値ごとに記録し、差分が変わればgateの
fingerprintにより外れる。fatalがあればApplyを無効化する。書き込みstepはverified件数と実測往復
回数、各operationの待機・実行中・verify済みを表示し、残り時間は推定しない。完了時は「実機に
反映した」ことだけを確認し、電源断後の永続化は未確認だと明示する。中断後は途中状態を持ち越さず
full readからやり直す。

<!-- @code src/ui/components/index.ts#Overview -->

## Overview layer grid

Overviewは全layerを4列のmini盤面で表示する。mini盤面は幅218pxへfitさせ、高さは盤面の外接矩形
から導く（倍率の計算はKeymap editorと同じ`src/render/geometry.ts`）。未使用layerは薄く表示し、
未使用または到達不能のtagを付ける。layer名が無い場合も`layer N`として番号を隠さない。SVGとPDF
のexportボタンは配置だけを実装し、未実装であることが分かるdisabled状態にする。

<!-- @code src/ui/components/index.ts#Behaviors -->
<!-- @code src/ui/components/index.ts#References -->

## Behaviors and references

Behaviorsは既存どおりTap Dance、Combo、Settingsをcoreの編集関数へ渡して保存する。Referencesは
dynamic entryのusages / unusedとlayerのunreachableを、診断panelとは別の参照情報として表示する。

<!-- @code src/ui/components/index.ts#WorkspaceRecovery -->

## Workspace recovery

workspaceを読めない場合は、keymap欠落、旧digest binding、その他の読み込み失敗を分けて表示し、
実機readによる初期化、binding移行、再読み込みの導線をそれぞれ提示する。初期化はworkspaceファイル
を作るだけで実機へwriteせず、実機操作の安全境界を維持する。
