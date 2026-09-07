import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseMacKeymapYaml } from "./parse.ts";
import type { MacKeymapDocument } from "./types.ts";
import { validateMacKeymap } from "./validate.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/mac-keyboard");
const DESIRED = parseMacKeymapYaml(readFileSync(join(FIXTURES, "desired.yaml"), "utf8"));

function documentOf(layers: readonly Record<string, string>[]): MacKeymapDocument {
  return {
    profile: "Cornix Bonsai",
    layers: new Map(
      layers.map((assignments, layer) => [layer, new Map(Object.entries(assignments))]),
    ),
  };
}

test("desired.yaml は診断を出さない", () => {
  const result = validateMacKeymap(DESIRED);
  deepStrictEqual(result.diagnostics, []);
  deepStrictEqual(result.summary, { error: 0, warning: 0, information: 0 });
});

test("Karabiner に無い key_code は error になる", () => {
  // lint を通らない生成物を作らないため、位置は表で閉じる。
  const result = validateMacKeymap(documentOf([{ not_a_key: "KC_A" }]));
  strictEqual(result.diagnostics[0]?.code, "mac-keymap/unknown-position");
  strictEqual(result.diagnostics[0]?.severity, "error");
  strictEqual(result.summary.error, 1);
});

test("QMK に対応の無い fn は位置として書ける", () => {
  deepStrictEqual(validateMacKeymap(documentOf([{ fn: "KC_A" }])).diagnostics, []);
});

test("書かれていない layer を指す MO は warning になる", () => {
  const result = validateMacKeymap(documentOf([{ a: "MO(9)" }]));
  strictEqual(result.diagnostics[0]?.code, "mac-keymap/unknown-layer");
  strictEqual(result.diagnostics[0]?.severity, "warning");
});

test("layer 0 から辿り着けない layer は information になる", () => {
  // 書いたとおりに rule へは入る。失われる値が無いので error にしない（ADR 0010）。
  const result = validateMacKeymap(documentOf([{ a: "KC_A" }, { b: "KC_B" }]));
  strictEqual(result.diagnostics[0]?.code, "mac-keymap/unreachable-layer");
  strictEqual(result.diagnostics[0]?.severity, "information");
});

test("落とせない keycode は表現可能性の error として出る", () => {
  const result = validateMacKeymap(documentOf([{ a: "TD(0)" }]));
  strictEqual(result.diagnostics[0]?.code, "mac-keymap/unsupported-keycode");
  strictEqual(result.summary.error, 1);
});
