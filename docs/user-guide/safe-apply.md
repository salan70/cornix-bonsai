# Safe Applyと復旧

Applyは、workspaceのdesired stateと実機の現在状態の差分だけをCornix LPへwriteする操作です。
実行にはWeb UI、実機接続、最新のfull read、人間による差分確認が必要です。

## Apply前の確認

1. 正しいworkspace名がheaderに表示されていることを確認します。
2. 正しいCornix LPへ接続していることを確認します。
3. `実機から再読み込み`を実行し、full readを完了させます。
4. エラー・警告と`実機との差分`件数を確認します。
5. 意図しないUIDまたはdefinition不一致が表示された場合はApplyしません。

接続しただけでは最新状態を取得していません。Apply前には、そのsessionで取得したfull readが必要です。

## Applyの手順

```text
全readをbackup
→ validation
→ semantic diff
→ 人間が確認
→ 差分を1件ずつwrite
→ 同じentryを再readしてverify
→ 全体をfull readして差分0件へ収束
```

1. status barの`実機へ Apply…`を選びます。
2. `cornix/backups/`へfull readが保存されたことを確認します。
3. modalの`書き込む差分`でbefore / afterと対象を確認します。
4. 警告がある場合は、内容を理解した項目だけ確認します。
5. errorが0件で、すべての差分が意図どおりなら`<件数> 件を実機へ書き込む`を選びます。
6. 完了するまで実機を切断せず、writeとverifyの進捗を確認します。

Cornix Bonsaiはwrite commandの応答だけを成功と見なしません。1件ごとに同じentryを再readし、値の一致を
確認してから次へ進みます。

## 警告とエラー

- errorはApplyを停止します。確認操作で越えることはできません。
- warningは項目ごとの明示確認が必要です。
- warningの根拠となる値や差分が変わると、以前の確認は無効になります。
- informationは状況説明で、単独ではApplyを停止しません。

警告を確認することは、問題を修正したことを意味しません。実機へ反映してよい理由を判断できる場合だけ
確認してください。

## 中断・切断・verify失敗

Apply中に中断、切断、timeout、verify不一致が起きた場合は、その続きから再開しません。最後に応答が
返ったentryも反映されていない可能性があります。

1. 実機を再接続します。
2. `実機から再読み込み`でfull readを最初からやり直します。
3. 新しい実機状態とdesired stateから差分を再計算します。
4. 改めて差分を確認し、必要な場合だけApplyします。

途中までwriteされた状態も、新しいfull readへそのまま現れます。古い進捗を推測して差分を減らさないで
ください。

## Backupから復元する

Apply前の最新状態は`cornix/backups/latest.vil`に保存されます。headerの`backup から復元`は、この
backupを実機へ直接writeせず、workspaceのdesired stateへ読み込みます。

1. `backup から復元`を選びます。
2. Keymapと差分を確認します。
3. 必要なら通常どおりvalidation、警告確認、Applyへ進みます。

復元にも通常のSafe Applyと同じ確認が必要です。backupを選んだだけでは実機は変わりません。

## 電源を切っても残るか確認する

Apply完了時に確認できるのは、実機へ反映され、直後の再readと一致したことです。firmwareがその後に行う
flash保存の完了までは確認できません。

永続性も確認する場合は、Apply完了後にCornix LPの電源を入れ直し、再接続してfull readしてください。
これは通常のApply成功条件とは別の、利用者による追加確認です。
