# GUIテーマ選択

## 目的

Web UIでLight / Darkを切り替えられるようにし、選択をブラウザへ保存する。

## 判断

- 選択肢は`system` / `light` / `dark`の3択とする。
- 初期値は`system`。systemは`prefers-color-scheme`へ追従し、明示選択はOS設定を上書きする。
- localStorageの不正値・アクセス失敗は`system`へフォールバックする。
- 実効テーマは`document.documentElement[data-theme]`へ反映し、CSS tokenの定義を一元化する。

## 変更

- テーマ設定の読み書き、OS設定の監視、DOM反映を`src/ui/theme.ts`へ集約した。
- headerへアクセシブルなテーマselectを追加した。
- Light / Dark token、UI仕様、ADR 0011 / 0013を手動切替と永続化の契約へ更新した。
- 保存値、フォールバック、実効テーマ、既存contrastの回帰テストを追加した。

## 検証

- 固定Nix環境でtest、typecheck、build、lint、DocBridge checkを実行する。
- ブラウザで3テーマの切替、再読み込み後の復元、system選択時のOS変更追従を確認する。
