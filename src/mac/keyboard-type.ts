/**
 * 実行中の Mac の内蔵キーボードの物理配列を OS へ問い合わせる Node adapter。
 *
 * `src/core/mac-keymap/` は platform に触らない。`src/karabiner/node.ts` と並ぶ
 * もう 1 つの macOS 境界で、こちらは Karabiner ではなく OS 自身に訊く。
 *
 * 判定の正は Carbon の `KBGetLayoutType(LMGetKbdType())`。FourCharCode で
 * `'ANSI'` / `'ISO '` / `'JIS '` を返す（2026-09-19 に実測。手元の MacBook は
 * `LMGetKbdType=46` → `0x414E5349` = `'ANSI'`）。
 *
 * **他の経路は使わない。**
 * - `karabiner_grabber_devices.json` には ANSI / JIS を示す field が無い（ADR 0024 で確認済み）
 * - `karabiner.json` の `virtual_hid_keyboard.keyboard_type_v2` は
 *   `generateOwnedProfile` が `document.layout` から**書く**値なので循環する
 * - `ioreg` の `alt_handler_id` は同じ番号（46）を返すが、番号から配列への表を
 *   自前で持つ必要があり、世代ごとの値が不明で乖離する
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";

const execFileAsync = promisify(execFile);

/** macOS 同梱の JXA。ObjC bridge から Carbon を呼ぶ。追加依存を持ち込まないための選択。 */
const OSASCRIPT = "/usr/bin/osascript";

const SCRIPT = [
  'ObjC.import("Carbon");',
  "var raw = $.LMGetKbdType();",
  "var type = $.KBGetLayoutType(raw);",
  "String.fromCharCode((type >>> 24) & 255, (type >>> 16) & 255, (type >>> 8) & 255, type & 255);",
].join("\n");

/** Carbon が返す FourCharCode と、扱える物理配列の対応。ISO は対象外（#23）。 */
const LAYOUT_BY_CODE: ReadonlyMap<string, MacKeyboardLayout> = new Map([
  ["ANSI", "ansi"],
  ["JIS ", "jis"],
]);

/**
 * 内蔵キーボードの物理配列。判定できなければ `undefined`。
 *
 * macOS 以外、`osascript` が無い、Carbon が想定外の値を返す、`ISO` だった、の
 * いずれでも `undefined` を返す。**検出は任意の追加情報**で、取れないことを理由に
 * 処理を止めない。呼び出し側は `--layout` の明示指定へ落とす。
 *
 * @doc docs/specs/mac-keymap.md#detectbuiltinlayout
 */
export async function detectBuiltInLayout(): Promise<MacKeyboardLayout | undefined> {
  if (process.platform !== "darwin") return undefined;
  try {
    const { stdout } = await execFileAsync(OSASCRIPT, ["-l", "JavaScript", "-e", SCRIPT]);
    return LAYOUT_BY_CODE.get(stdout.replace(/\n$/, ""));
  } catch {
    return undefined;
  }
}
