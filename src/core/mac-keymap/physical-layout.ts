/**
 * MacBook 内蔵キーボードの物理盤面。Browser UI の盤面描画専用の派生データ。
 *
 * Semantic Core は React、filesystem、WebHID の詳細から独立させる（AGENTS.md）。
 *
 * definition（KLE）由来ではない手書きデータである。位置識別子は Karabiner の
 * `key_code` 名で、matrix の row / col は持たない（ADR 0022 と同じ姿勢。ADR 0025）。
 * 手書きゆえの typo は physical-layout.test.ts の不変条件（`KARABINER_POSITIONS` との
 * 整合・重複なし・矩形の重なりなし）で検出する。
 *
 * キーの存在は実機確認と HID usage 定義に基づく。座標と幅は Apple 公開の製品画像
 * からの読み取りで、Inference として保守する（詳細は ADR 0025）。
 * Touch ID / 電源は `key_code` が無いため盤面に置かない。JIS の縦長 Return は
 * 矩形（1u x 2u）で近似する。
 */

import type { MacKeyboardLayout } from "./types.ts";

/**
 * 盤面上のキー 1 個。`keyCode` は Karabiner の `key_code` 名（`fn` 含む）が位置識別子。
 * 単位は KLE と同じ `u`。rotation は MacBook 盤面に回転キーが無いため常に 0 で、
 * `src/render/geometry.ts` の `KeyShape` を構造的部分型として満たす。
 *
 * @doc docs/specs/mac-keymap.md#physical-layout
 */
export interface MacPhysicalKey {
  readonly keyCode: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationAngle: number;
  readonly rotationX: number;
  readonly rotationY: number;
}

function key(keyCode: string, x: number, y: number, width = 1, height = 1): MacPhysicalKey {
  return { keyCode, x, y, width, height, rotationAngle: 0, rotationX: 0, rotationY: 0 };
}

/** function 行の高さ。実機の半分高キーの近似。 */
const FUNCTION_ROW_HEIGHT = 0.65;

/** 主要 5 行の y 座標。function 行の直下から 1u 刻み。 */
const ROW_Y = [
  FUNCTION_ROW_HEIGHT,
  FUNCTION_ROW_HEIGHT + 1,
  FUNCTION_ROW_HEIGHT + 2,
  FUNCTION_ROW_HEIGHT + 3,
  FUNCTION_ROW_HEIGHT + 4,
] as const;

/** 連続する 1u キーを左から並べる。 */
function run(keyCodes: readonly string[], startX: number, y: number): MacPhysicalKey[] {
  return keyCodes.map((keyCode, index) => key(keyCode, startX + index, y));
}

/** function 行。esc 1.5u + F1〜F12。Touch ID（右端 1u）は key_code が無いので置かない。 */
function functionRow(): MacPhysicalKey[] {
  const keys = [key("escape", 0, 0, 1.5, FUNCTION_ROW_HEIGHT)];
  for (let index = 1; index <= 12; index++) {
    keys.push(key(`f${index}`, 0.5 + index, 0, 1, FUNCTION_ROW_HEIGHT));
  }
  return keys;
}

/** 矢印 block。左右と下は半分高で下寄せ、上下は 1u セル内に 0.5u を積む。 */
function arrowBlock(startX: number, y: number): MacPhysicalKey[] {
  return [
    key("left_arrow", startX, y + 0.5, 1, 0.5),
    key("up_arrow", startX + 1, y, 1, 0.5),
    key("down_arrow", startX + 1, y + 0.5, 1, 0.5),
    key("right_arrow", startX + 2, y + 0.5, 1, 0.5),
  ];
}

const LETTER_ROW_TOP = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"] as const;
const LETTER_ROW_HOME = ["a", "s", "d", "f", "g", "h", "j", "k", "l"] as const;
const LETTER_ROW_BOTTOM = ["z", "x", "c", "v", "b", "n", "m"] as const;
const DIGIT_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/** ANSI（US）。全 6 行の幅は 14.5u。 */
function ansiLayout(): readonly MacPhysicalKey[] {
  return [
    ...functionRow(),
    // 数字行: ` 1〜0 - = delete
    key("grave_accent_and_tilde", 0, ROW_Y[0]),
    ...run(DIGIT_ROW, 1, ROW_Y[0]),
    ...run(["hyphen", "equal_sign"], 11, ROW_Y[0]),
    key("delete_or_backspace", 13, ROW_Y[0], 1.5),
    // tab 行: tab q〜p [ ] バックスラッシュ
    key("tab", 0, ROW_Y[1], 1.5),
    ...run(LETTER_ROW_TOP, 1.5, ROW_Y[1]),
    ...run(["open_bracket", "close_bracket", "backslash"], 11.5, ROW_Y[1]),
    // home 行: caps a〜l ; ' return
    key("caps_lock", 0, ROW_Y[2], 1.75),
    ...run(LETTER_ROW_HOME, 1.75, ROW_Y[2]),
    ...run(["semicolon", "quote"], 10.75, ROW_Y[2]),
    key("return_or_enter", 12.75, ROW_Y[2], 1.75),
    // shift 行: shift z〜m , . / shift
    key("left_shift", 0, ROW_Y[3], 2.25),
    ...run(LETTER_ROW_BOTTOM, 2.25, ROW_Y[3]),
    ...run(["comma", "period", "slash"], 9.25, ROW_Y[3]),
    key("right_shift", 12.25, ROW_Y[3], 2.25),
    // 最下行: fn ctrl opt cmd space cmd opt 矢印
    ...run(["fn", "left_control", "left_option"], 0, ROW_Y[4]),
    key("left_command", 3, ROW_Y[4], 1.25),
    key("spacebar", 4.25, ROW_Y[4], 5),
    key("right_command", 9.25, ROW_Y[4], 1.25),
    key("right_option", 10.5, ROW_Y[4]),
    ...arrowBlock(11.5, ROW_Y[4]),
  ];
}

/**
 * JIS。全 6 行の幅は 14.5u。ANSI との違いは、数字行が `1` 始まりで `^`（equal_sign）と
 * `¥`（international3）を持つこと、Return が縦長（1u x 2u の矩形近似）なこと、
 * `_`（international1）と英数 / かな（japanese_eisuu / japanese_kana）を持つこと、
 * grave と右 option が無いこと。
 */
function jisLayout(): readonly MacPhysicalKey[] {
  return [
    ...functionRow(),
    // 数字行: 1〜0 - ^ ¥ delete
    ...run(DIGIT_ROW, 0, ROW_Y[0]),
    ...run(["hyphen", "equal_sign", "international3"], 10, ROW_Y[0]),
    key("delete_or_backspace", 13, ROW_Y[0], 1.5),
    // tab 行: tab q〜p @ [ Return（tab 行と home 行に跨る縦長）
    key("tab", 0, ROW_Y[1], 1.5),
    ...run(LETTER_ROW_TOP, 1.5, ROW_Y[1]),
    ...run(["open_bracket", "close_bracket"], 11.5, ROW_Y[1]),
    key("return_or_enter", 13.5, ROW_Y[1], 1, 2),
    // home 行: caps a〜l ; : ]
    key("caps_lock", 0, ROW_Y[2], 1.5),
    ...run(LETTER_ROW_HOME, 1.5, ROW_Y[2]),
    ...run(["semicolon", "quote", "backslash"], 10.5, ROW_Y[2]),
    // shift 行: shift z〜m , . / _ shift
    key("left_shift", 0, ROW_Y[3], 2.25),
    ...run(LETTER_ROW_BOTTOM, 2.25, ROW_Y[3]),
    ...run(["comma", "period", "slash", "international1"], 9.25, ROW_Y[3]),
    key("right_shift", 13.25, ROW_Y[3], 1.25),
    // 最下行: fn ctrl opt cmd 英数 space かな cmd 矢印
    ...run(["fn", "left_control", "left_option"], 0, ROW_Y[4]),
    key("left_command", 3, ROW_Y[4], 1.25),
    key("japanese_eisuu", 4.25, ROW_Y[4]),
    key("spacebar", 5.25, ROW_Y[4], 4),
    key("japanese_kana", 9.25, ROW_Y[4]),
    key("right_command", 10.25, ROW_Y[4], 1.25),
    ...arrowBlock(11.5, ROW_Y[4]),
  ];
}

const LAYOUTS: ReadonlyMap<MacKeyboardLayout, readonly MacPhysicalKey[]> = new Map([
  ["ansi", ansiLayout()],
  ["jis", jisLayout()],
]);

/**
 * `layout` 宣言（ADR 0024）に対応する物理盤面。
 *
 * @doc docs/specs/mac-keymap.md#physical-layout
 */
export function macPhysicalLayout(layout: MacKeyboardLayout): readonly MacPhysicalKey[] {
  const keys = LAYOUTS.get(layout);
  if (keys === undefined) throw new Error(`unknown layout: ${layout}`);
  return keys;
}
