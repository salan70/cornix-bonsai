import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseDefinition } from "../core/definition/parse.ts";
import { createKeycodeTable } from "../core/keycode/table.ts";
import { keycodeDisplay, basicLabel } from "./keycode-labels.ts";

const definition = parseDefinition(
  readFileSync(
    join(import.meta.dirname, "../../fixtures/cornix-lp/vial-definition-v1.12.json"),
    "utf8",
  ),
);
const table = createKeycodeTable(definition, {
  layerCount: 10,
  macroCount: 0,
  tapDanceCount: 32,
  comboCount: 32,
});

test("basic keycodes use Vial-style keycap labels", () => {
  assert.equal(basicLabel("KC_KP_7"), "7");
  assert.equal(basicLabel("KC_KP_SLASH"), "/");
  assert.equal(basicLabel("KC_TILD"), "~");
  assert.equal(basicLabel("KC_1"), "!\n1");
  assert.equal(basicLabel("KC_GRAVE"), "~\n`");
  assert.equal(basicLabel("KC_COMMA"), "<\n,");
  assert.equal(basicLabel("KC_INT3"), "JYEN");
  assert.equal(basicLabel("KC_A"), "A");
});

test("keycode表示名はraw式の完全一致だけを置き換える", () => {
  const labels = {
    layers: new Map<number, string>(),
    keycodes: new Map([["LCG(KC_Q)", "VeryLongShortcut"]]),
  };
  assert.deepEqual(keycodeDisplay("LCG(KC_Q)", labels, table), {
    primary: "VeryLongShortcut",
    name: "VeryLongShortcut",
    raw: "LCG(KC_Q)",
  });
  assert.equal(keycodeDisplay("KC_Q", labels, table).primary, "Q");
  assert.equal(keycodeDisplay("LCG(KC_Q)", labels, table, { compact: true }).primary, "VeryLon…");
});

test("純粋なShift wrapperは入力結果だけを表示する", () => {
  const labels = { layers: new Map<number, string>(), keycodes: new Map<string, string>() };
  assert.deepEqual(keycodeDisplay("LSFT(KC_SLASH)", labels, table), { primary: "?" });
  assert.deepEqual(keycodeDisplay("RSFT(KC_1)", labels, table), { primary: "!" });
  assert.deepEqual(keycodeDisplay("LSFT(KC_A)", labels, table), { primary: "A" });
});

test("複合Shiftはmodifierを残し、hold文言だけを表示しない", () => {
  const labels = { layers: new Map<number, string>(), keycodes: new Map<string, string>() };
  assert.deepEqual(keycodeDisplay("SGUI(KC_2)", labels, table), {
    primary: "@\n2",
    role: "⌘",
  });
  assert.deepEqual(keycodeDisplay("LSFT_T(KC_SPACE)", labels, table), {
    primary: "Space",
    role: "⇧",
  });
  assert.equal(keycodeDisplay("LT1(KC_A)", labels, table).role?.startsWith("hold"), false);
  assert.equal(keycodeDisplay("MO(2)", labels, table).role, undefined);
});
