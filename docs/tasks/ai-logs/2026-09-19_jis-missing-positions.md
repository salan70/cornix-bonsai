# JIS盤面に無いANSI固有キーを検出できるようにする

日付: 2026-09-19 / ADR: 0024（Open Questionの解決） / 先行: ADR 0025（盤面データ）

## 目的

`LAYOUT_MISSING_POSITIONS.jis`が空集合のまま放置されており、JIS MacBookに存在しない
`grave_accent_and_tilde` / `right_option`へ割り当てても**診断が1件も出なかった**。
ADR 0024はこれをOpen Questionとして「実機Factが得られたらデータ追加だけで対応できる」と
書いていたが、ADR 0025でJIS / ANSI両方の盤面データが入った時点で盤面の差から埋められる
状態になっていた。

## 調査（Fact）

実行して確認した`macPhysicalLayout`の対称差。

| 集合              | 内容                                                               | `LAYOUT_MISSING_POSITIONS`の被覆 |
| ----------------- | ------------------------------------------------------------------ | -------------------------------- |
| JIS盤面のみ（4）  | `international1` `international3` `japanese_eisuu` `japanese_kana` | ansi側に全部ある                 |
| ANSI盤面のみ（2） | `grave_accent_and_tilde` `right_option`                            | **jis側にどちらも無い**          |

修正前: `layout: jis`でこの2キーへ割り当てたときの診断は**0件**。
修正後: **2件**（いずれもwarning）。同じ再現スクリプトで確認。

## 採らなかった案

**盤面（`macPhysicalLayout`）を位置存在の単一定義元にする案は不採用。**
盤面に無い位置は`KARABINER_POSITIONS`の153件中74件（JIS）あるが、その中には
`volume_increment` / `display_brightness_decrement` / `mission_control`などの
consumer usageが含まれる。MacBookの物理キーは`fn`の状態でF1〜F12とこれらを
**別usageとして送り分ける**ため、盤面に無いことが「決して発火しない」の根拠にならない。
盤面は firability の proxy として不健全で、広く警告すると偽陽性を出す。

同じ理由で`keypad_*` / `f13`〜`f24` / ナビゲーションクラスタも集合へ入れていない。
これらは「配列の差」ではなく「内蔵キーボードに無いだけ」で、性質が違う。

## 実装

- `src/core/mac-keymap/key-codes.ts` — `LAYOUT_MISSING_POSITIONS`の`jis`側へ
  `grave_accent_and_tilde` / `right_option`を追加。根拠は実機Factではなく盤面からの
  **Inference**（盤面自体の実機照合はADR 0025のOpen Questionに残る）。
  集合に入れないものの基準もdoc commentへ書いた
- `src/core/mac-keymap/physical-layout.test.ts` — 不変条件を1本追加。
  「片方の盤面にしかない位置は、もう片方の`LAYOUT_MISSING_POSITIONS`に入っている」。
  既存の不変条件は片方向（盤面 ∩ MISSING = ∅）だけで、この漏れを検出できなかった
- `src/core/mac-keymap/validate.test.ts` — 2キーへの割り当てがwarningになることを固定
- `docs/specs/mac-keymap.md` — 集合の根拠、覆うべき範囲、入れない基準、不変条件の一覧
- `docs/decisions/0024-mac-keyboard-layout-declaration.md` — Open Questionを解決として記録

294件パス（追加2件）。

## 残る穴

**内蔵キーボードに存在しない位置（`keypad_*`など）は依然として無診断。** 上記のとおり
盤面を根拠にできないため、別の根拠（usageの送り分けの実機確認）が要る。ADR 0026で
`devices`に外付けキーボードを登録できるようになったので、外付けでは実在しうる点も
併せて設計する必要がある。
