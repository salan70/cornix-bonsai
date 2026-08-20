import assert from "node:assert/strict";
import test from "node:test";
import { isKnownKeycode } from "../core/validation/keycode-vocabulary.ts";
import {
  EXTRA_ROW,
  ISO_JIS_ROWS,
  PICKER_GROUP_OFFSETS,
  PICKER_TOTAL_UNITS,
  type PickerEntry,
} from "./keycode-catalog.ts";

function entries(): PickerEntry[] {
  return [
    ...ISO_JIS_ROWS.flatMap((row) => [...row.main, ...(row.nav ?? []), ...(row.numpad ?? [])]),
    ...EXTRA_ROW,
  ];
}

function units(entriesToMeasure: readonly PickerEntry[]): number {
  return entriesToMeasure.reduce((total, entry) => total + (entry.u ?? 1), 0);
}

test("ISO/JIS picker contains only known, unique keycodes", () => {
  const keycodes = entries()
    .filter(
      (entry): entry is Extract<PickerEntry, { readonly keycode: string }> => "keycode" in entry,
    )
    .map((entry) => entry.keycode);
  assert.equal(new Set(keycodes).size, keycodes.length);
  for (const keycode of keycodes) assert.equal(isKnownKeycode(keycode), true, keycode);
});

test("ISO/JIS main rows preserve their intended physical widths", () => {
  assert.deepEqual(
    ISO_JIS_ROWS.map((row) => units(row.main)),
    [16, 16, 16, 16, 16, 16],
  );
  assert.deepEqual(
    ISO_JIS_ROWS.map((row) => units(row.nav ?? [])),
    [3, 3, 3, 0, 3, 3],
  );
  assert.deepEqual(
    ISO_JIS_ROWS.map((row) => units(row.numpad ?? [])),
    [0, 4, 4, 4, 4, 4],
  );
  assert.equal(units(EXTRA_ROW), 26);
});

test("picker groups use fixed 26u coordinates", () => {
  assert.deepEqual(PICKER_GROUP_OFFSETS, { main: 0, nav: 18, numpad: 22 });
  assert.equal(PICKER_TOTAL_UNITS, 26);
});
