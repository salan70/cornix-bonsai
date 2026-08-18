# 実機readはVIA / Vialのprojectionを唯一の入力とし、比較はu16 keycodeで行う

状態: 採用

## 背景

Cornix Bonsaiは実機の現在状態をreadできないと、backupもsemantic diffもwrite後verifyも
成立しない（AGENTS.mdのApplyフロー）。VialがHIDで読めるのはVIA / Vial protocolが定義する
範囲だけで、これはfirmware内部の状態そのものではない。

R-003の調査（Spike: `spikes/r-003-vial-read-flow/`）で、以下が確認できた。

- vial-guiの`Keyboard.reload()`が読む項目の集合が、そのまま`.vil`の全fieldを構成する。
  Cornix LPの構成では168往復（うちkeymap buffer 40、tap dance 32、combo 32、encoder 20）
- 容量（layer数、macro本数、macro buffer長、tap dance / combo / key override /
  alt repeat keyの本数、対応qsid）はすべて実機が申告する。firmwareのbuild時configで決まるため、
  Cornix LPでも定数として持てない
- RMKの`to_via_keycode`はVIAで表現できないKeyActionを`0`（`KC_NO`）へ落とす。
  readで得られるのは内部keymapではなくVIA表現へのprojectionである
- 実機から返るkeycodeはu16。`.vil`の`KC_XXX`表記はvial-guiが`Keycode.serialize`で
  付けた名前であり、aliasを含めて1:1ではない（ADR 0001）

## 選択肢

1. `.vil`と同じ文字列keycodeへ正規化した状態をdeviceStateとし、比較もそこで行う
2. VIA / Vialのwire値（u16と各entryのfield）をdeviceStateとし、名前は表示側の派生とする
3. 実機readを持たず、`.vil`のimport / exportだけでMVPを構成する

## 決定

案2を採る。実機readはvial-guiの`reload()`と同じ順序・同じ解釈で行い、得られたwire値を
deviceStateの定義とする。

- readのcommand列はvial-guiの実装に従う（順序と分割単位を独自に変えない）
- 容量は毎回実機から読み、`.vil`やdefinitionの値を根拠に省略しない
- keycodeはu16のまま保持する。`KC_XXX`表記との変換は表示・`.vil` I/Oの境界でのみ行う
- write後verifyの比較単位は、同じread flowで取り直したwire値の以下の単位とする
  - keymap: `(layer, row, col)` ごとのu16
  - encoder: `(layer, index, direction)` ごとのu16。direction 0が反時計回り（ADR 0002）
  - tap dance: index ごとの`(tap, hold, double tap, hold after tap, timeout)`
  - combo: index ごとの`(入力4, 出力1)`
  - settings: qsid ごとの値
  - macro: buffer の byte 列
- 実機writeは差分writeに限る。全buffer writeは行わない

## 理由

- 案1は正規化テーブル（D-001）に依存する。テーブルの取りこぼしがそのままverifyの
  偽陰性になり、「writeが成功した」と誤判定する経路を作る。比較はwire値で閉じるべき
- readがprojectionである以上、readできなかった内部状態を全buffer writeで上書きすると
  ユーザーの設定を静かに壊す。差分writeなら触っていない位置は書かないので影響しない
- 案3はbackup / verifyが成立せず、Applyフローの前提を満たさない

## 影響

- deviceStateはwire値のモデルになる。`.vil`のrawモデル（ADR 0001）とは別の層であり、
  両者の対応づけに正規化テーブルが要る（D-001 / D-003の入力）
- 容量を実機から読む以上、UIは「本数が実機ごとに違う」前提で組む必要がある
- definitionはxz圧縮されて届く。ブラウザ実装にxz decoderが要る（D-004の入力）
- readは168往復ある。1往復ずつ直列で待つため、進捗表示とtimeout方針が要る（R-004の入力）
- keymapのbulk write（VIA `0x13`）はRMK側の実装がread（`0x12`）と非対称で、
  offsetの単位もendiannessも食い違う。write経路では使わない（R-005で確定させる）
