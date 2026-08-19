# `.vil` の raw 層

`.vil`（Vialのkeymap export）を逐語で保持し、書き戻す層の仕様です。
保証範囲の判断はADR 0001にあります。ここには実装と突き合わせられる契約だけを書きます。

<!-- @code src/core/vil/types.ts#VilDocument -->

## VilDocument

`.vil`をimportした結果。**この層はkeycodeを解釈しません。**

保持する情報:

- top-level keyの出現順（`raw.keyOrder`）
- `VIL_KEYS`にない未知のtop-level field（`raw.unknown`）
- ネストした未知field（`key_override`や`macro`の要素は構造のまま保持する）
- keycode文字列の表記（`KC_BSPC`を`KC_BSPACE`へ畳まない）
- `uid`（64bit整数のため**文字列**として保持する）

`layout[layer][row][col]`の値は、keycode文字列か`-1`です。`-1`は「その位置に物理キーが無い」
を意味し、「キーはあるが割り当てが空」の`KC_NO`とは別物です。混同すると
keyboard definitionと矛盾する`.vil`を作ります。判定には`isAbsent`を使います。

<!-- @code src/core/vil/parse.ts#parseVil -->

## parseVil

`.vil`のテキストを`VilDocument`へ読み込みます。

`uid`は素の`JSON.parse`では桁落ちします（実測`16882930253541522617`が
`16882930253541523000`になる）。そのため`JSON.parse`のreviverの第3引数から
元のテキスト表記を取り出し、文字列のまま保持します。

対象は**top-levelの`uid`だけ**です。未知fieldの中に`uid`があっても型を変えません。
未知fieldは解釈せず持ち回るのが前提のため、中身の型を書き換えてはいけません。

期待した形でない入力には`VilParseError`を投げます。黙って既定値へ落としません。

<!-- @code src/core/vil/serialize.ts#serializeVil -->

## serializeVil

`VilDocument`を`.vil`のテキストへ書き出します。

保証するのは**意味round-trip**です。`parseVil(serializeVil(parseVil(x)))`が
`parseVil(x)`と一致します。**byte一致は保証しません**（ADR 0001）。

ただし差分を読める状態に保つため、python `json.dumps`既定の書式へ寄せます。
区切りは`", "`と`": "`、非ASCIIは`\uXXXX`へエスケープします。
`uid`はraw層では文字列ですが、`.vil`上は数値なので引用符を外して戻します。

実測では`fixtures/cornix-lp/baseline.vil`はbyte一致します。
`fixtures/cornix-lp/edge-cases.vil`はpythonが`1000.0`と書く数値を含むためbyte一致しません。
