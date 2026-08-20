# raw keycode式へ表示名を割り当てる

状態: 採用

2026-08-20に、Anyキーなどで設定した独自ショートカットを各画面で識別しやすくするために決めた。
実機へのwrite・flash・bootloader操作は行っていない。

## 背景

VialのAnyキー由来の設定は、`LCG(KC_Q)`や`SGUI(KC_2)`のようなraw keycode式として保存される。
保存された値からAnyキーで作られたかどうかを確実に復元する情報は無いため、物理位置やkeycodeの
分類を推測して名前を割り当てることはできない。一方、同じraw式を複数のlayerやencoderで使うと、
raw表記だけでは独自ショートカットの意味を読み取りにくい。

## 選択肢

1. raw keycode式をそのまま表示し、名前を持たない
2. 物理キーごとに名前を保存する
3. raw keycode式をキーにしたworkspace共通の表示名をsidecarへ保存する

## 決定

案3を採る。ADR 0012で決めた`cornix/labels.yaml`を拡張し、layer名とraw keycode式の表示名を保存する。

- schemaは`cornix-bonsai/labels@2`とする。`@1`はlayer名だけのlegacy形式として読み込む
- `keycodes`のkeyはraw keycode式の完全一致、valueは人間向け表示名とする
- 表示名はUnicodeを許可し、空文字は保存しない。名前の重複は許可する
- keymapのraw値、validation、semantic diff、Apply fingerprint、実機write入力は変更しない
- 盤面・picker・Overviewは表示名を主表示にし、titleでraw式を確認できるようにする
- 詳細、Behaviors、References、Apply、SVG/PDFでは表示名とraw式を併記する
- 表示名の編集はKeyPanelから行い、`labels.yaml`だけを既存のworkspace保存queueで更新する

## 理由

raw式をキーにすれば、Anyキー由来かどうかを推測せずに任意の独自ショートカットを扱える。同じ式を
複数位置で使っても名前が一貫し、sidecarは実機へ送る状態と分離されたままである。Applyの確認では
ユーザー定義名だけを信頼せず、常にraw式と既存の挙動説明を併記するため、表示名の誤記がwrite内容を
隠すこともない。

## 影響

- 表示名の変更は`keymap.yaml`のdiffやApply対象件数を変えない
- alias正規化やwrapper内部への部分一致は行わない。`LCG(KC_Q)`と`KC_Q`は別の表示名を持つ
- 使用されなくなった表示名の自動削除や専用管理画面は実装しない。不要なentryはsidecarから手動で削除する
- SVG/PDFは名前とraw式を2段で出力し、名前が無い場合は従来のraw表示を維持する
