# `.vil` は raw を保持し、意味round-tripを保証する

状態: 採用

## 背景

`.vil`はVialが`json.dumps`で書き出すJSONで、Vial側の`restore_layout`は読み込み時に
keycodeを正規化し、対応外の値を無言で`KC_NO`へ落とす。Cornix Bonsaiが`.vil`をimportして
再exportする際、どこまでを保証範囲とするかを決めないと、ユーザーの設定を静かに失う。

R-001の調査（Spike: `spikes/r-001-vil-roundtrip/`）で、以下が確認できた。

- `uid`は64bit整数で、JavaScriptの`JSON.parse`では桁落ちする
- Vialの出力は`json.dumps`既定の区切り（`", "` / `": "`）と非ASCIIの`\uXXXX`エスケープを使う
- keycodeは文字列だが、alias（`KC_BSPC` / `LT(1,kc)` など）と正準形が1:1ではない
- 未対応のkeycode文字列はVial自身が`KC_NO`へ落とす（無言の情報欠落）

## 選択肢

1. 内部モデルを正規化した意味表現のみとし、exportは正準形で書き直す
2. rawのJSON構造をそのまま保持し、意味表現は派生ビューとして持つ
3. rawテキストを保持し、編集箇所だけをtext patchする

## 決定

案2を採る。importで`.vil`のraw構造（key順・未知field・keycode文字列）を保持したうえで
Semantic Modelを構成し、exportではrawの保持情報を使って復元する。

- 保証するのは**意味round-trip**（import → export → importでモデルが一致すること）
- **byte一致**はbest effortとし、保証しない
- `uid`は数値ではなく文字列として保持する
- 未知のtop-level fieldとネストしたfieldはrawのまま持ち回して再出力する
- keycode文字列は正規化して保存し直さず、入力された表記のまま保持する

## 理由

- 未知fieldをdropすると、Vialの将来versionが追加した設定を静かに壊す
- keycodeを正準形へ書き換えると、Cornix Bonsaiが触っていない行までdiffに現れ、
  semantic diffのS/N比が下がる
- `uid`を数値のまま扱うと、round-trip時点で別のキーボードを指すidになる
- byte一致まで保証すると、pythonの数値表記（`1000.0`）など仕様外の再現に引きずられる

## 影響

- importerはJSONを素の`JSON.parse`で扱えない。`uid`の文字列化など前処理が要る
- exporterはVial互換の文字列化（区切り・`ensure_ascii`相当）を自前で持つ必要がある
- keycodeを非正規化のまま保持するため、比較・validationは正規化を挟む必要がある
  （正規化テーブルの単一の定義元が別途要る。D-001およびD-003の入力とする）
- 実機Applyでは、Vial側の`restore_layout`と同じ正規化・切り捨てが起きる前提で
  writeの前後にverifyを置く必要がある
