# MVP acceptance checklist（実機・手動）

Issue #13 / #14 / #15 のレビュー指摘のうち、**コードでは閉じられない受入条件**をここに集約する。
自動検証（`pnpm test` / `typecheck` / `lint` / CLI smoke）で代替できないものだけを載せる。

前提: macOS + Chrome または Chromium、Cornix LP 実機、`pnpm run dev` で起動した開発サーバー。
File System Access API と WebHID の両方が必要なため、これらに未対応のブラウザでは実施できない。

## A. Browser workspace（#13）

1. `Workspaceを開く` から実 workspace directory を選択できる
2. `keymap.yaml` と `cornix/definitions/<digest>.json` を正常に読み込める
3. reload 後、directory を再選択せずに復帰する
4. 外部エディタで `keymap.yaml` を書き換えたあとに UI から編集すると、上書きせず競合として報告する
5. キーを 3 文字ぶん連続で編集しても入力が巻き戻らず、最後の入力が `keymap.yaml` に残る

## B. Device I/O（#14）

1. USB で discover → full read が完了する
2. BLE で discover → full read が完了し、USB の結果と一致する
3. full read 直後の diff が、意図した編集ぶんだけになっている
   （`layout_options` と keycode 表記の偽差分が出ないこと。回帰 test の実機側の確認）
4. 代表 1 entry を write → 同一 entry の再 read で verify できる
5. 物理的に切断すると header が切断済みへ変わり、Apply 計画が破棄される
6. 再接続すると古い `HIDDevice` を再利用せず、full read からやり直せる

## C. Safe Apply end-to-end（#15）

1. workspace open → reload restore → BLE full read
2. キーを編集して保存 → validation / diff を確認
3. 人間確認を経て Apply → 1 件ずつ write + 再 read verify
4. 完了後に diff が 0 件へ収束する
5. disconnect → reacquire → full read で状態が整合する
6. USB でも 1〜5 の主要フローが成立する
7. `.vil` import した設定を workspace へ反映して diff を確認できる
8. 同じ workspace を CLI で validate / diff できる
9. SVG / PDF export ができる
10. 電源 off / on 後に再 read し、書き込んだ内容が残っているかを確認する
    （**Apply の成功条件ではない**。flash durability は保証しない）

## D. MVP blocker と post-MVP の仕分け

Issue #15 の完了条件が要求する明示。**未実装のまま MVP を締める**項目は以下で、
いずれも Apply の安全性を損なわない。

| 項目                                             | 扱い            | 根拠                                            |
| ------------------------------------------------ | --------------- | ----------------------------------------------- |
| macro の semantic 表現（action 単位の分解）      | post-MVP        | ADR 0009。raw のまま保持し write 経路も持たない |
| `key_override` / `alt_repeat_key` の意味解釈     | post-MVP        | ADR 0010。実機が非ゼロなら full read を中断する |
| 到達性解析の combo / tap dance 経由の layer 遷移 | post-MVP        | 偽陽性の方向にしか外れない（D-003）             |
| 大量変更 warning の閾値（20 件・30%）の実測根拠  | post-MVP        | 実運用の diff を見るまで根拠が出ない（D-003）   |
| 往復 timeout 3000ms を詰める根拠                 | post-MVP        | 現行値で安全側。詰める必要が出ていない（D-005） |
| QMK 基本 keycode 語彙の完全網羅                  | post-MVP        | 未知表記は warning で報告し KC_NO へ落とさない  |
| 上記 A / B / C の実機・手動受入                  | **MVP blocker** | Issue #13 / #14 / #15 の完了条件そのもの        |

A / B / C が残っている間は #13 / #14 / #15 を close しない。
