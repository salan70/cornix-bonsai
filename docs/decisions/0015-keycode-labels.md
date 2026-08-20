# keycode pickerとkeycapラベルをVialのISO/JIS面に合わせる

状態: 採用

表示レイアウトとShift / Holdの補助表示に関する決定は、ADR 0017で更新した。

2026-08-20に、keycode pickerと盤面keycapの表記・配列をVialのISO/JIS面へ揃えるために決めた。
実機へのwrite・flash・bootloader操作は行っていない。

## 背景

現行pickerは`KP_7`や`TILD`のような内部名をそのまま表示し、base keycodeからshift後の記号を
読み取れなかった。mainの行幅も揃っておらず、numpad / navigationの行位置がVialの面とずれていた。
さらに固定40pxのキー幅と行間gapの組み合わせが、狭い画面で横スクロールを発生させていた。

## 選択肢

1. 内部keycode名を短縮するだけに留める
2. pickerだけをVial風にする
3. coreのshift対応表を単一定義元にして、pickerとkeycapを同じラベル・ISO/JIS配列で更新する

## 決定

案3を採る。

- `SHIFTED_TO_BASE`と`BASE_TO_SHIFTED`をcoreの単一定義元とし、wire encodeと表示の両方から参照する
- 表記は中間案とし、記号・numpad・JISキーはVial刻印へ寄せる。modifier・layer・Tap Danceのroleは
  現行の`⇧`、`⌘`、`hold ⌘`、`Tap Dance`を維持する
- pickerとkeycapの両方でbase keycodeへshift後の記号を併記する。keycapはこのため最大3段を許容し、
  ADR 0011の「2段まで」を更新する
- pickerはmainを6行16uへ揃え、navigation / numpadをVialの行位置へ置く。ISO Enterの行跨ぎは再現せず、
  3段目末尾のEnterと4段目末尾のspacerで表現する
- shift済み記号とJISキーの追加列はgrid外の26uストリップに置き、pickerのコンテナ幅からキーpitchを
  自動縮小して横スクロールを無くす

## 理由

同じkeycodeをpickerと盤面で選び・読むためには、wire encode用のshift表と表示側の対応表を分けると
base / shiftedの追加漏れが起きる。coreの双方向表を共有すれば、`KC_1`の`!`併記とwire値の変換が
同じ事実に基づく。

`KP_7`を`7`、`KC_INT3`を`JYEN`として表示するのは、編集時に内部語彙ではなくキーキャップの刻印を
探せるようにするためである。一方、modifierやlayerのroleをVialのraw形式へ寄せると、既存UIの意味
表記と衝突するため変更しない。

## 影響

- keycapの主ラベルは改行を含み、roleと合わせて最大3段になる。CSSは`pre-line`と詰めたline-heightで
  収め、titleには従来どおり完全なkeycodeを残す
- pickerの物理配列は表示専用であり、definitionや実機のmatrix layoutは変更しない
- ISO Enterの物理的な行跨ぎは省略する。pickerの行幅と読みやすさを優先した意図的な近似である
- `src/ui/keycode-labels.ts`を`.ts`へ分離し、Node testのglobとDocBridgeのcode scopeでラベル関数を直接検証する
