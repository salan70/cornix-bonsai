import { notStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { macPhysicalLayout } from "../core/mac-keymap/physical-layout.ts";
import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";
import { macKeycapLabel } from "./mac-keycap-labels.ts";

test("両盤面の全keyCodeに表示名がある", () => {
  // 表に無いkeyCodeは名前がそのまま返る（fallback）。表示名とkeyCode名が一致してよいのは
  // 数字・fn・tabだけなので、それ以外での一致は表の抜けとして検出する。
  const sameAsKeyCode = /^([0-9]|fn|tab)$/;
  for (const layout of ["ansi", "jis"] as const satisfies readonly MacKeyboardLayout[]) {
    for (const { keyCode } of macPhysicalLayout(layout)) {
      const label = macKeycapLabel(keyCode, layout);
      strictEqual(label.length > 0, true, `${layout} の ${keyCode}`);
      if (!sameAsKeyCode.test(keyCode)) {
        notStrictEqual(label, keyCode, `${layout} の ${keyCode} が表に無い`);
      }
    }
  }
});

test("同じkeyCodeでも配列で刻印が変わる", () => {
  strictEqual(macKeycapLabel("equal_sign", "jis"), "^");
  strictEqual(macKeycapLabel("equal_sign", "ansi"), "=");
  strictEqual(macKeycapLabel("open_bracket", "jis"), "@");
  strictEqual(macKeycapLabel("open_bracket", "ansi"), "[");
});

test("文字・数字・Fキーは名前から導出する", () => {
  strictEqual(macKeycapLabel("a", "jis"), "A");
  strictEqual(macKeycapLabel("7", "jis"), "7");
  strictEqual(macKeycapLabel("f12", "ansi"), "F12");
});
