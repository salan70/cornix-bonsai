/**
 * 検証用の最小の desired state。
 *
 * `self-check.mjs` と `verify-on-macbook.sh` の埋め込み JSON が
 * 同じものを指していることを保証するため、ここを単一の定義元にする。
 *
 * 位置は Karabiner の `key_code` 名で、値は QMK 表記（ADR 0022）。matrix の row / col は無い。
 * 書かれていないキーは素通しなので、全キーを並べる必要がない。
 */
export const DESIRED = {
  schema: "cornix-bonsai/mac-keymap@1",
  profile: "Cornix Bonsai",
  layers: [
    {
      // layer 0: 単押し Esc / 長押し Ctrl、かなキーで layer 1、英数キーで layer 2
      caps_lock: "LCTL_T(KC_ESC)",
      japanese_kana: "LT1(KC_LANG1)",
      japanese_eisuu: "MO(2)",
      right_command: "TG(3)",
    },
    {
      // layer 1: カーソル移動
      h: "KC_LEFT",
      j: "KC_DOWN",
      k: "KC_UP",
      l: "KC_RGHT",
      a: "KC_HOME",
      e: "KC_END",
      d: "KC_DEL",
    },
    {
      // layer 2: function key と無効化
      1: "KC_F1",
      2: "KC_F2",
      q: "KC_NO",
      w: "KC_TRNS",
      caps_lock: "LCTL_T(KC_ESC)",
    },
    {
      // layer 3: TG で切り替わる。テンキー相当
      u: "KC_7",
      i: "KC_8",
      o: "KC_9",
    },
  ],
};
