# Overviewを参照layer中心の一画面ダッシュボードにする

状態: 採用

2026-08-20に、Overviewで必要なkeymap情報を一望できるようにするため、ADR 0011のOverview部分を更新する。
実機操作とApplyの仕様は変更しない。

## 背景

従来のOverviewは全layerを4列のmini盤面で描いていたが、encoderの既定割り当てまで「使用中」と数えるため、
実際には参照されていないlayerも同じ密度で表示していた。またmini盤面のkey文字を隠しており、layer間の
関係、各keyの内容、使用中Tap Danceの内容を1画面で確認できなかった。

## 決定

- 初期表示はlayer 0と、物理キー・encoder・Tap Dance・Comboのkeycode領域から参照されるlayerに限定する。
- 参照元のないlayerは既定で非表示にし、toggleで表示できるようにする。表示用の参照集計は既存のreachability
  診断とは分離し、診断severity・validation・Apply gateへ影響させない。
- layer cardには全物理キーとencoderの左右回転を表示する。各keyは既存のkeycode displayのprimaryとroleを使い、
  raw式はtitleへ残す。
- layer名は`cornix/labels.yaml`へinline保存できる。trim後の空文字は名前削除、重複名は許可し、未指定時は`layer N`
  と表示する。
- layer操作の対象には決定的な色、`L番号`、layer名を与え、参照元とtarget cardで共有する。hover/focus時のみ
  SVG overlayの線を描く。色だけを識別手段にしない。
- Tap Danceは参照数が1以上のentryと、そのtap / hold / double tap / hold after tap / timeout、usage countを
  読み取り専用で表示する。編集はBehaviorsへ残す。
- 1280×800のbaseline workspaceで、初期状態はページスクロールなしに収める。参照なしlayerを展開した状態の
  スクロールは許可する。

## 理由

割り当ての有無だけでは、encoderの共通操作や意図的に到達不能なlayerを区別できない。参照元を正とすることで、
ユーザーが実際に辿れる操作とlayer cardの関係を直接示せる。Tap DanceとComboも走査対象にすることで、物理キー
だけを見た場合の見落としを避ける。

線を常時描くと複数参照が交差して盤面を覆うため、通常は色と識別子だけを表示し、hover/focus時だけ線を追加する。
L番号・名前・aria-labelを併用することで、色覚差やpalette循環があっても対象を特定できる。

## 影響

- Overview専用の純粋な表示モデルとlayer参照型が追加される。
- layer名変更は表示用sidecarだけを更新し、`VilDocument`、keymap YAML、semantic diff、validation、Apply fingerprint
  は変更しない。
- SVG/PDF exportは引き続き未実装disabledであり、Overviewの線は画面表示専用である。
- 既存のADR 0011にある「全layerを4列で表示」という記述は本ADRと`docs/specs/ui.md`で置き換える。
