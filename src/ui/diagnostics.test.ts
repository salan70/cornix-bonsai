import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { createDiagnostic } from "../core/validation/types.ts";
import {
  boardDiagnosticMarks,
  canJumpTo,
  diagnosticSelection,
  groupDiagnostics,
  subjectLabel,
} from "./diagnostics.ts";

const key = createDiagnostic(
  "reference/tap-dance",
  "warning",
  { kind: "key", layer: 1, row: 2, col: 3 },
  "w",
  {},
);
const keyError = createDiagnostic(
  "structure/x",
  "error",
  { kind: "key", layer: 1, row: 2, col: 3 },
  "e",
  {},
);
const encoder = createDiagnostic(
  "reference/tap-dance",
  "warning",
  { kind: "encoder", layer: 0, index: 1, direction: "cw" },
  "w2",
  {},
);
const info = createDiagnostic(
  "reachability/unreachable",
  "information",
  { kind: "layer", layer: 4 },
  "i",
  {},
);
const mac = createDiagnostic(
  "mac-keymap/unsupported",
  "error",
  { kind: "macKey", layer: 2, keyCode: "a" },
  "m",
  {},
);

test("同じcodeの診断を最初に現れた順で1群へまとめる", () => {
  const groups = groupDiagnostics([key, info, encoder]);
  deepStrictEqual(
    groups.map((group) => [group.code, group.items.length]),
    [
      ["reference/tap-dance", 2],
      ["reachability/unreachable", 1],
    ],
  );
});

test("診断の対象をCornixのlayerと選択、Macのlayerと選択へ写す", () => {
  deepStrictEqual(diagnosticSelection(key.subject), {
    layer: 1,
    selection: { kind: "key", row: 2, col: 3 },
  });
  deepStrictEqual(diagnosticSelection(encoder.subject), {
    layer: 0,
    selection: { kind: "encoder", index: 1, direction: "cw" },
  });
  deepStrictEqual(diagnosticSelection(info.subject), { layer: 4 });
  deepStrictEqual(diagnosticSelection(mac.subject), {
    macLayer: 2,
    selection: { kind: "macKey", keyCode: "a" },
  });
  deepStrictEqual(diagnosticSelection({ kind: "tapDance", index: 0 }), {});
  strictEqual(canJumpTo({ kind: "document" }), false);
  strictEqual(canJumpTo(mac.subject), true);
});

test("盤面の印はerrorを優先し、informationと盤面外の対象を出さない", () => {
  const marks = boardDiagnosticMarks([key, keyError, encoder, info, mac]);
  strictEqual(marks.get("key:1:2:3"), "error");
  strictEqual(marks.get("encoder:0:1:cw"), "warning");
  strictEqual(marks.get("macKey:2:a"), "error");
  strictEqual(marks.size, 3);
});

test("対象の文言はencoderの回転方向を日本語で出す", () => {
  strictEqual(subjectLabel(encoder.subject), "layer 0 / encoder 1 右回し");
  strictEqual(subjectLabel({ kind: "setting", qsid: 7 }), "settings / qsid 7");
});
