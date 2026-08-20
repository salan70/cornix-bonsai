import assert from "node:assert/strict";
import test from "node:test";
import { basicLabel } from "./keycode-labels.ts";

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
