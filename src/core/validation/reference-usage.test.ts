import { deepStrictEqual } from "node:assert/strict";
import { test } from "node:test";
import type { VilDocument } from "../vil/types.ts";
import { collectReferenceUsage } from "./reference-usage.ts";

const document: VilDocument = {
  version: 1,
  uid: "1",
  layout: [[["TD(1)", "M(2)", "LSFT(TD(1))"]]],
  encoderLayout: [[["KC_A", "M(2)"]]],
  layoutOptions: 0,
  macro: [[], [], []],
  vialProtocol: 6,
  viaProtocol: 9,
  tapDance: [["KC_A", "KC_NO", "KC_NO", "KC_NO", 200]],
  combo: [["TD(1)", "KC_A", "KC_NO", "KC_NO", "KC_NO"]],
  keyOverride: [],
  altRepeatKey: [],
  settings: {},
  raw: { keyOrder: [], unknown: {} },
};

test("dynamic entryの参照をwrapper内部も含めて数える", () => {
  const usage = collectReferenceUsage(document);

  deepStrictEqual([...usage.tapDance.entries()], [[1, 3]]);
  deepStrictEqual([...usage.macro.entries()], [[2, 2]]);
});
