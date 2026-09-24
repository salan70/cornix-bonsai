/**
 * MacBook 内蔵キーボードの物理キャップ表示名。
 *
 * `keyCode`（Karabiner の `key_code` 名）は HID usage 由来の ANSI 基準の名前なので、
 * 同じ `keyCode` でも刻印は配列で変わる（例: JIS の `equal_sign` は `^`）。
 * 割り当ての無いキー（素通し）の faint 表示と、panel の位置表示に使う。
 * 表示専用の語彙なので UI 層に置く（Core の語彙は `KARABINER_POSITIONS` が正）。
 */

import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";

const SHARED: Readonly<Record<string, string>> = {
  escape: "esc",
  delete_or_backspace: "delete",
  tab: "tab",
  caps_lock: "caps",
  return_or_enter: "return",
  left_shift: "shift",
  right_shift: "shift",
  fn: "fn",
  left_control: "control",
  left_option: "option",
  right_option: "option",
  left_command: "⌘",
  right_command: "⌘",
  spacebar: "space",
  left_arrow: "←",
  right_arrow: "→",
  up_arrow: "↑",
  down_arrow: "↓",
  hyphen: "-",
  semicolon: ";",
  comma: ",",
  period: ".",
  slash: "/",
};

/** ANSI 基準の名前どおりの刻印。 */
const ANSI_ONLY: Readonly<Record<string, string>> = {
  grave_accent_and_tilde: "`",
  equal_sign: "=",
  open_bracket: "[",
  close_bracket: "]",
  backslash: "\\",
  quote: "'",
};

/** JIS の刻印。HID usage の名前と物理刻印がずれるキーが多い。 */
const JIS_ONLY: Readonly<Record<string, string>> = {
  equal_sign: "^",
  open_bracket: "@",
  close_bracket: "[",
  backslash: "]",
  quote: ":",
  international1: "_",
  international3: "¥",
  japanese_eisuu: "英数",
  japanese_kana: "かな",
};

/**
 * 盤面キャップの表示名。文字・数字・F キーは名前から導出し、それ以外は配列別の表で引く。
 *
 * @doc docs/specs/ui.md#mac-board
 */
export function macKeycapLabel(keyCode: string, layout: MacKeyboardLayout): string {
  if (/^[a-z]$/.test(keyCode)) return keyCode.toUpperCase();
  if (/^[0-9]$/.test(keyCode)) return keyCode;
  const functionKey = /^f(\d{1,2})$/.exec(keyCode);
  if (functionKey !== null) return `F${functionKey[1]}`;
  const specific = layout === "jis" ? JIS_ONLY[keyCode] : ANSI_ONLY[keyCode];
  return specific ?? SHARED[keyCode] ?? keyCode;
}
