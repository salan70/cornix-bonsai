import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseDefinition } from "../definition/parse.ts";
import type { KeyboardDefinition } from "../definition/types.ts";
import { createKeycodeTable, type Capacities } from "./table.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const definition = parseDefinition(
  readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
);

/** baseline.vil から観測した容量。 */
const CAPACITIES: Capacities = {
  layerCount: 10,
  macroCount: 32,
  tapDanceCount: 32,
  comboCount: 32,
};

test("USERnn は definition の定義順で解決する", () => {
  const table = createKeycodeTable(definition, CAPACITIES);

  deepStrictEqual(table.resolve("USER00"), {
    kind: "custom",
    index: 0,
    name: "BT0",
    title: "Bluetooth Channel 0",
    shortName: "BT0",
  });
  strictEqual(table.customKeycodes.length, definition.customKeycodes.length);
});

test("definition が違えば同じ USER00 が別の keycode を指す", () => {
  // ADR 0002 の「同じ USER01 が別の keycode を指す」が起きることの証明。
  // テーブルをモジュール定数にできない理由がここにある。
  const reordered: KeyboardDefinition = {
    ...definition,
    customKeycodes: [...definition.customKeycodes].reverse(),
  };

  const original = createKeycodeTable(definition, CAPACITIES).resolve("USER00");
  const swapped = createKeycodeTable(reordered, CAPACITIES).resolve("USER00");

  strictEqual(original.kind, "custom");
  strictEqual(swapped.kind, "custom");
  if (original.kind !== "custom" || swapped.kind !== "custom") return;
  strictEqual(original.name !== swapped.name, true);
});

test("definition に無い USERnn は範囲外として返す（黙って KC_NO へ落とさない）", () => {
  const table = createKeycodeTable(definition, CAPACITIES);
  const resolved = table.resolve("USER30");

  strictEqual(resolved.kind, "outOfRange");
});

test("容量が変われば同じ keycode の解決結果が変わる", () => {
  // ADR 0003 の「容量は実機が申告する」。layer 数・tap dance 数は firmware ごとに違うため、
  // 語彙を定数として持てない。
  const wide = createKeycodeTable(definition, CAPACITIES);
  const narrow = createKeycodeTable(definition, { ...CAPACITIES, layerCount: 2 });

  deepStrictEqual(wide.resolve("MO(4)"), { kind: "layerMomentary", layer: 4 });
  strictEqual(narrow.resolve("MO(4)").kind, "outOfRange");
});

test("layer / tap dance / macro の語彙を容量つきで解釈する", () => {
  const table = createKeycodeTable(definition, CAPACITIES);

  deepStrictEqual(table.resolve("LT1(KC_LANG2)"), {
    kind: "layerTap",
    layer: 1,
    inner: "KC_LANG2",
  });
  deepStrictEqual(table.resolve("TD(1)"), { kind: "tapDance", index: 1 });
  strictEqual(table.resolve("M40").kind, "outOfRange"); // macro は 32 件
});

test("KC_NO と KC_TRNS を構造的な意味として区別する", () => {
  const table = createKeycodeTable(definition, CAPACITIES);

  strictEqual(table.resolve("KC_NO").kind, "none");
  strictEqual(table.resolve("KC_TRNS").kind, "transparent");
  strictEqual(table.resolve("KC_TRANSPARENT").kind, "transparent");
});

test("正規化テーブル未実装の keycode は表記を保ったまま素通しする", () => {
  // QMK の基本 keycode 語彙の網羅は D-003 の範囲。ここでは表記を失わないことだけを保証する。
  const table = createKeycodeTable(definition, CAPACITIES);

  deepStrictEqual(table.resolve("LSFT_T(KC_SPACE)"), {
    kind: "basic",
    name: "LSFT_T(KC_SPACE)",
  });
  deepStrictEqual(table.resolve("0x1234"), { kind: "basic", name: "0x1234" });
});
