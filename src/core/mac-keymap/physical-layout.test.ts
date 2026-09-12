import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { KARABINER_POSITIONS, LAYOUT_MISSING_POSITIONS } from "./key-codes.ts";
import { parseMacKeymapYaml } from "./parse.ts";
import type { MacPhysicalKey } from "./physical-layout.ts";
import { macPhysicalLayout } from "./physical-layout.ts";
import type { MacKeyboardLayout } from "./types.ts";

const LAYOUTS: readonly MacKeyboardLayout[] = ["ansi", "jis"];

// 手書き盤面データの不変条件。KLE 由来でないぶん、typo をここで機械検出する（ADR 0025）。

test("盤面の全キーは書ける位置（KARABINER_POSITIONS）である", () => {
  for (const layout of LAYOUTS) {
    for (const { keyCode } of macPhysicalLayout(layout)) {
      ok(KARABINER_POSITIONS.has(keyCode), `${layout} の ${keyCode}`);
    }
  }
});

test("盤面内で keyCode は重複しない", () => {
  for (const layout of LAYOUTS) {
    const seen = new Set<string>();
    for (const { keyCode } of macPhysicalLayout(layout)) {
      ok(!seen.has(keyCode), `${layout} の ${keyCode} が重複`);
      seen.add(keyCode);
    }
  }
});

test("その配列に存在しない位置（LAYOUT_MISSING_POSITIONS）を盤面に置かない", () => {
  for (const layout of LAYOUTS) {
    const missing = LAYOUT_MISSING_POSITIONS.get(layout);
    ok(missing !== undefined);
    for (const { keyCode } of macPhysicalLayout(layout)) {
      ok(!missing.has(keyCode), `${layout} に ${keyCode} は無いはず`);
    }
  }
});

test("矩形は重ならない", () => {
  // 手書き座標の typo 検出器。接するのは正常なので ε だけ食い込みを許す。
  const EPSILON = 1e-9;
  const overlaps = (a: MacPhysicalKey, b: MacPhysicalKey): boolean =>
    a.x + a.width > b.x + EPSILON &&
    b.x + b.width > a.x + EPSILON &&
    a.y + a.height > b.y + EPSILON &&
    b.y + b.height > a.y + EPSILON;

  for (const layout of LAYOUTS) {
    const keys = macPhysicalLayout(layout);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        ok(a !== undefined && b !== undefined);
        ok(!overlaps(a, b), `${layout} の ${a.keyCode} と ${b.keyCode} が重なる`);
      }
    }
  }
});

test("fixture（JIS）の全 from 位置が JIS 盤面に載る", () => {
  const text = readFileSync(
    join(import.meta.dirname, "../../../fixtures/mac-keyboard/desired.yaml"),
    "utf8",
  );
  const document = parseMacKeymapYaml(text);
  strictEqual(document.layout, "jis");

  const positions = new Set(macPhysicalLayout("jis").map(({ keyCode }) => keyCode));
  for (const assignments of document.layers.values()) {
    for (const keyCode of assignments.keys()) {
      ok(positions.has(keyCode), `${keyCode} が盤面に無い`);
    }
  }
});

test("両盤面は同じ外形（幅 14.5u）に収まる", () => {
  for (const layout of LAYOUTS) {
    const keys = macPhysicalLayout(layout);
    const maxX = Math.max(...keys.map(({ x, width }) => x + width));
    const maxY = Math.max(...keys.map(({ y, height }) => y + height));
    strictEqual(maxX, 14.5, `${layout} の幅`);
    strictEqual(maxY, 5.65, `${layout} の高さ`);
  }
});
