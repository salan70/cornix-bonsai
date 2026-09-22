import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { chooseSaveCandidate } from "./save-state.ts";

test("複数ファイルの競合を最優先で表示し、対象pathを保つ", () => {
  const selected = chooseSaveCandidate([
    { target: "keymap", path: "keymap.yaml", state: { kind: "saving" } },
    {
      target: "labels",
      path: "cornix/labels.yaml",
      state: { kind: "conflict", message: "外部変更" },
    },
  ]);

  strictEqual(selected.target, "labels");
  strictEqual(selected.path, "cornix/labels.yaml");
  deepStrictEqual(selected.state, { kind: "conflict", message: "外部変更" });
});

test("通常失敗は保存中より優先し、同じ優先度ではkeymapを維持する", () => {
  const selected = chooseSaveCandidate([
    { target: "keymap", path: "keymap.yaml", state: { kind: "error", message: "I/O" } },
    { target: "labels", path: "cornix/labels.yaml", state: { kind: "saving" } },
  ]);
  strictEqual(selected.target, "keymap");

  const tie = chooseSaveCandidate([
    { target: "keymap", path: "keymap.yaml", state: { kind: "saving" } },
    { target: "labels", path: "cornix/labels.yaml", state: { kind: "saving" } },
  ]);
  strictEqual(tie.target, "keymap");
});
