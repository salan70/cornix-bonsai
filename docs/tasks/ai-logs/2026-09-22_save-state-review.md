# 保存状態レビュー対応

## 目的

保存状態のファイル別管理と再レビューB4の修正を実施した。

## 判断

`keymap.yaml`と`cornix/labels.yaml`のSaveStateを分離し、単一表示領域では競合、通常失敗、保存中、保存済みの優先順位で表示する。

競合時は再試行を表示せず、未保存編集の警告と再読み込み導線を表示する。

通常のI/O失敗では対象ファイルだけを再試行する。

## 指摘対応

B1は競合時の再試行を廃止し、再読み込みと未保存編集の警告へ分離して解消した。

B2はqueueのrun完了後にだけ保存済みを通知し、後続保存中の誤表示を解消した。

B3はCornixのApplyとMacの`cornix mac apply`を個別表示して解消した。

B4はkeymap.yamlとcornix/labels.yamlの状態・path・再試行を分離し、単一表示の優先規則とテストを追加して解消した。

N1はlabels.yamlの保存対象を状態と再試行へ反映して解消した。

N2はworkspace世代ガードで旧queue callbackを無視して解消した。

N3はlive regionを状態ラベルだけに限定して解消した。

N4はc-接頭辞、primitive export、設計仕様、token利用を整えて解消した。

N5は保存状態テスト、AI log、静的Markdown整形を追加して解消した。

## 検証

`nix develop -c just test`、`typecheck`、`build`、`docbridge-check`、`lint`を実行し、すべて成功した。
