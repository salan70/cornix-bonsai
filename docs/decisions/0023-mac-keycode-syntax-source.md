# Mac keyboardのkeycode構文層はclassifyKeycodeを単一の定義元とする

状態: 採用

2026-09-07に、ADR 0022の実装（`[I-022]` #21）へ着手する前に、既存のkeycode構文解析の
実装状況を確認して決めた。

## 背景

ADR 0022は「`src/core/keycode/table.ts`の`createKeycodeTable`は`definition`と`capacities`を
引数に取るためそのままは使えない。**pattern解析だけを純関数として切り出す**」と書き、
「`ResolvedKeycode`へ`TG(n)`とmod-tapを追加する」を影響として挙げていた。Issue #21も
これをそのまま完了条件にしていた。

実装へ入る前にコードを確認したところ、前提が成立していないことが分かった。

- `src/core/validation/keycode-vocabulary.ts`の`classifyKeycode`は、すでに
  **`definition`も`capacities`も引数に取らない純関数**である
- Mac generatorが必要とする語彙は`KeycodeLexeme`が100%カバーしている。
  `MO(n)`・`LT(n, kc)`と`LT n(kc)`の両形式・`TG(n)`・`<MOD>_T(kc)`と`MT(mod, kc)`の
  両形式が`layerSwitch`と`modTap`として解けている
- 同ファイル冒頭のコメントとADR 0010が、**「語彙表を`core/keycode/table.ts`へ置かない」**を
  すでに決めている。理由は`createKeycodeTable`が「解決」の責務で、
  「その表記をQMKの語彙として読めるか」は「判定」であり層が違うこと
- 構文解析の実装は現在3か所ある。`table.ts`（5パターン）、`keycode-vocabulary.ts`（網羅）、
  `keycode/wire.ts`（u16変換用）。ADR 0022のとおり`table.ts`から切り出すと4か所目ができる

## 選択肢

1. ADR 0022とIssue #21の記述どおり、`table.ts`からpattern解析を切り出し、
   `ResolvedKeycode`へ`layerToggle`と`modTap`のvariantを追加する
2. `classifyKeycode`をMac側の構文層として使い、`table.ts`と`ResolvedKeycode`は触らない
3. `classifyKeycode`を唯一の構文層とし、`createKeycodeTable.resolve`もその上の解決層へ
   書き換えて重複を完全に消す

## 決定

案2を採る。Mac generatorは`classifyKeycode`が返す`KeycodeLexeme`から
Karabinerのmanipulatorへ直接写像する。`src/core/keycode/table.ts`と`ResolvedKeycode`は
変更しない。

ADR 0022の「keycode語彙」節のうち、`table.ts`からの切り出しと`ResolvedKeycode`の拡張を
指示していた部分は本ADRが上書きする。**Karabinerへ落とせないkeycodeをvalidation errorに
する**という同節の決定は変わらない。

## 理由

- **ADR 0010との整合**。「語彙表は`table.ts`へ置かない」はADR 0010の決定であり、
  ADR 0022はそれを認識せずに逆方向を指示していた。新しい判断で古い判断を暗黙に覆さない
- **重複を増やさない**。案1は構文解析を4実装にする。`TG`とmod-tapのpatternは
  `keycode-vocabulary.ts`にすでに存在するので、書き足す必要そのものが無い
- **Cornix LP側の挙動を変えない**。案1は`ResolvedKeycode`が`basic`として素通ししていた
  mod-tapをvariant化するため、`baseline.vil`のlayer 0にある8個のmod-tapの解釈が変わる。
  `table.test.ts`の「正規化テーブル未実装のkeycodeは表記を保ったまま素通しする」は
  ADR 0001・0006に根拠を持つ意図的な契約であり、Macの都合で書き換える理由が無い
- 案3は重複を完全に消せるが、Issue #21のスコープ外のrefactorを持ち込む。
  `table.ts`の重複解消はそれ自体を判断として切り出すべきで、Macの実装に混ぜない

## 影響

- `ResolvedKeycode`には`TG(n)`もmod-tapも入らない。Vial側のkeymapでこれらは引き続き
  `kind: "basic"`として素通しされる。表示と保存はこれまでどおり表記を保つ
- Mac generatorは`KeycodeLexeme`の全variantを扱う。Karabinerへ落とせるのは
  `basic`・`none`・`transparent`・`modTap`・`layerSwitch`のうち
  `momentary` / `layerTap` / `toggle`の3actionだけで、残りはerror diagnosticになる。
  `LSFT(KC_1)`のような`modified`はKarabinerで表現可能だが、要件に無いため今回は落とさない
- `classifyKeycode`の語彙表がMac側の表現可能性の上限を決める。表に無い表記は
  `unknown`になり、Mac側では`mac-keymap/unsupported-keycode`（error）として報告される。
  Vial側の`reference/unknown-keycode`（warning）とseverityが違うのは、
  Vialは実機が解釈するのに対しKarabinerは生成器が落とせなければ機能しないため
