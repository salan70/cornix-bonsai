import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { WorkspaceConflictError } from "../workspace/types.ts";
import { chooseSaveCandidate, saveFailureState } from "./save-state.ts";

test("外部変更の競合はconflict、それ以外の失敗はerrorへ畳む", () => {
  deepStrictEqual(saveFailureState(new WorkspaceConflictError("外部変更")), {
    kind: "conflict",
    message: "外部変更",
  });
  deepStrictEqual(saveFailureState(new Error("I/O")), { kind: "error", message: "I/O" });
  deepStrictEqual(saveFailureState("文字列"), { kind: "error", message: "文字列" });
});

test("すべてidleなら先頭のファイルを代表にする", () => {
  const selected = chooseSaveCandidate([
    { target: "mac", path: "mac-keyboard.jis.yaml", state: { kind: "idle" } },
  ]);
  strictEqual(selected.path, "mac-keyboard.jis.yaml");
});

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
