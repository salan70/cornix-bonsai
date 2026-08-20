import assert from "node:assert/strict";
import test from "node:test";
import { BASE_TO_SHIFTED, SHIFTED_TO_BASE, baseOf, shiftedOf } from "./shifted.ts";

test("shifted keycode pairs are bidirectional and complete", () => {
  assert.equal(Object.keys(SHIFTED_TO_BASE).length, 21);
  assert.equal(Object.keys(BASE_TO_SHIFTED).length, 21);
  for (const [shifted, base] of Object.entries(SHIFTED_TO_BASE)) {
    assert.equal(baseOf(shifted), base);
    assert.equal(shiftedOf(base), shifted);
  }
});
