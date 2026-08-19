# Semantic diff

2つの`.vil`を意味の単位で比較する仕様です。判断はADR 0010にあります。

## raw表現とsemantic表現の境界

規則はひとつです。**判定はrawで行い、semanticは表示にしか使いません。**

| 対象       | 比較に使う値           | 表示に使う値                      |
| ---------- | ---------------------- | --------------------------------- |
| keycode    | 入力表記のままの文字列 | `describeKeycode`が返す挙動の説明 |
| `USERnn`   | `USERnn`の表記         | definitionの`name` / `title`      |
| `settings` | qsid → 数値            | 任意の表示辞書。無ければ`qsid 22` |
| macro      | rawのJSON              | rawのまま                         |
| 未知field  | rawのJSON              | rawのまま                         |

`USERnn`を表記のまま比較するのは、同じ`USER01`がdefinitionごとに別のkeycodeを指すためです
（ADR 0002）。表示名で比較すると、definitionを差し替えたときに「変更なし」と誤判定します。

`settings`のqsidから設定名への対応表はVial側にあり、実機が対応qsidを申告します（ADR 0003）。
Cornix Bonsaiはこれを**任意の表示辞書**として受け取ります。辞書の有無で差分の件数は
変わりません。

diffは**単一のdefinition**を引数に取ります。definitionが違う2つのkeymapは`USERnn`の意味が
食い違うため比較が成立しません。その組み合わせはdiffではなく`validation/compatibility.ts`が
診断として扱います。

<!-- @code src/core/diff/diff.ts#diffDocuments -->

## diffDocuments

2つの`VilDocument`を比較します。比較単位はkey、encoder、tap dance、combo、settings、macro、
`layout_options`、未知fieldです。

`change`は`added` / `removed` / `changed` / `notationOnly`の4種類です。`notationOnly`は
aliasの書き換えなど**挙動が変わらない表記の差**で、`changedCount`には数えません。
ADR 0001がkeycodeを正規化せず保持すると決めているため、raw比較だけでは表記の差が
すべてdiffに出てしまいます。

<!-- @code src/core/diff/describe.ts#describeKeycode -->

## describeKeycode

keycodeを「挙動」の日本語で説明します。semantic diffがraw keycodeを並べずに済むのは
この関数のためです。

definition依存の部分（`USERnn`）だけ`KeycodeTable`に聞き、それ以外は語彙表で解きます。
`KC_TRNS`は「下のlayerの割り当てを透過する」、`KC_NO`は「何も起きない」として、
`.vil`上の別物を挙動の言葉で区別します。

<!-- @code src/core/diff/describe.ts#describeSetting -->

## describeSetting

settings 1件を表示用の文字列にします。

辞書にないqsidでも**必ず値を出します**。辞書の欠落で設定が画面から消えると、
ユーザーは変更に気づけません。

<!-- @code src/core/diff/bulk-change.ts#detectBulkChange -->

## detectBulkChange

想定外の大量変更を判定します。

大量変更は「そう編集した」よりも「definitionを取り違えた」「別のキーボードのkeymapを
読み込んだ」「layerが1つずれた」の徴候であることが多い一方、編集の規模そのものは
異常ではありません。そこで2つの条件を**AND**で課します。

- 変更件数が`minChangedEntries`（既定20）以上
- 変更の割合が`minChangedRatio`（既定0.3）以上

件数だけだと、10 layer × 50キーのkeymapでは1 layer差し替えただけで毎回引っかかります。
割合だけだと、comboを2件しか持たないkeymapで1件変えただけで50%になります。

layer単位の全面置換（`diff/layer-replaced`）は、件数が閾値に届かなくても取り違えの強い
徴候になるため別のcodeで警告します。どちらもwarningです。大量変更それ自体は壊れていない
のでerrorにはできませんが、見過ごすとkeymap全体を取り違えたまま実機へ書きます。
