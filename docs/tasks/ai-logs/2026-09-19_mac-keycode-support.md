# Karabinerの表現可能性をcoreから問い合わせられるようにする

日付: 2026-09-19 / ADR: 0025（pickerのvalidation委任の前提を変える準備） / 先行: ADR 0023

## 目的

Browser UIのkeycode pickerが、Karabinerへ落とせないkeycodeを無効化できるようにする。
ADR 0025は「UI側へ判定を複製すると必ず乖離する」を理由にdisabled化を退けたが、
**複製せずに同じ定義元へ問い合わせる**経路があれば、その理由は満たしたまま実現できる。

実測: picker 137セルのうち21セルがKarabiner非対応で、すべてが下段のshift記号ストリップ
（`KC_TILD`〜`KC_DQUO`）。グリッド本体（ISO/JIS 6行）は1セルも落ちない。

## 実装

`src/core/mac-keymap/generate.ts` に `macKeycodeSupport(keycode)` を追加。

**判定を書き写していない。** 実際の lowering（`manipulatorsForKey`）を1キーのprobeで
走らせ、error診断が出たかどうかで決める。判定ロジックの複製がゼロなので、構造的に
乖離しない。probeの位置とdeviceは`manipulatorsForKey`が判定に使わないため任意。

返すのは位置とlayerに依存しない判定だけ。書かれていないlayerを指す`MO(n)`のように
document全体を見ないと決まらないものは`validateMacKeymap`の担当で、この関数は見ない
（pickerで`MO(n)`を無効化してはいけない）。

## test

- 落とせる: `KC_A` `KC_TRNS` `KC_NO` `MO(1)` `TG(2)` `LT1(KC_SPACE)` `LCTL_T(KC_TAB)`
- 落とせない + code: `LSFT(KC_1)` `TD(0)` `M(0)` `USER00`（unsupported-keycode）、
  `LCTL_T(KC_NO)`（unsupported-mod-tap）、`LT1(KC_NO)`（unsupported-layer-tap-inner）
- **判定と生成器がずれない**: 同じサンプルで`generateKarabinerRules`のerror有無と
  `macKeycodeSupport`の結論が一致すること。将来だれかが判定を書き写した場合の検出器

297件パス（追加3件）。

## 次

Browser UI側の消費（pickerのcell無効化、`MacKeyPanel`の動作selectの絞り込み）。
ADR 0025の「pickerでdisabledにせずvalidationに委ねる」という決定文は、UI側の実装時に
「複製せずcoreへ問い合わせる」へ書き換える。
