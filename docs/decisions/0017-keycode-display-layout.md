# keycode表示の寸法とHold補助表示を固定する

状態: 採用

2026-08-20に、ADR 0015で導入したISO/JIS pickerとkeycapラベルの表示を、長い表示名でも位置が変わらない
よう更新した。実機へのwrite・flash・bootloader操作は行わない。

## 決定

- pickerは26uの固定座標で描き、mainを0〜16u、navigationを18〜21u、numpadを22〜26uへ置く。numpadの
  右端は下部26uストリップの右端と一致させる。
- encoder slotとキー全体 / Tap / Holdの適用先ボタンは、表示名やraw式の長さに関係なく同じ外形を保つ。
  収まらない主表示はellipsisに畳み、titleへ完全な表示を残す。
- `LSFT` / `RSFT`だけで構成されるmodified keycodeは、shift後の入力結果だけを表示する。複合modifierを
  含む場合は既存のmodifier表示を維持する。
- mod-tap / layer-tapのHold値は下段とaccent色で表し、`hold`という文言は省略する。momentary layerは
  layer用の背景・枠色でHold動作を示す。pickerの適用先ボタン名`Hold`と編集機能は維持する。

## 理由

表示名の長さがslotの幅・高さへ影響すると、encoderの割り当てやlayer切替で隣接要素の位置が変わり、
同じ物理位置を比較できない。固定slotとellipsisなら、可読性を保ちながらレイアウトを安定させられる。
純粋なShift wrapperは実際に入力される記号を示す方が、base keycodeとShift modifierを同時に表示するより
編集結果を直接読める。一方、複合modifierはショートカットの意味を失わないよう従来表示を残す。
