import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseDefinition } from "../core/definition/parse.ts";
import { diffDocuments, type DiffEntry } from "../core/diff/diff.ts";
import { setKeyAssignment } from "../core/model/edit.ts";
import { observeCapacities } from "../core/model/keymap-view.ts";
import { parseVil } from "../core/vil/parse.ts";
import {
  applyBlockedReason,
  applyRoundTripTotal,
  buildApplyGate,
  toWriteTarget,
} from "./apply-gate.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/cornix-lp");
const current = parseVil(readFileSync(join(FIXTURES, "baseline.vil"), "utf8"));
const definition = parseDefinition(
  readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
);
const device = {
  document: current,
  keyboardUid: current.uid,
  capacities: observeCapacities(current),
  supportedQsids: Object.keys(current.settings).map(Number),
};
const binding = { definitionPath: "keysync/definitions/abc.json", definitionDigest: "abc" };

function entry(subject: DiffEntry["subject"]): DiffEntry {
  return {
    subject,
    change: "changed",
    before: "",
    after: "",
    beforeBehavior: "",
    afterBehavior: "",
  };
}

test("差分をwrite単位へ写し、write未対応の対象はundefinedにする", () => {
  deepStrictEqual(toWriteTarget(entry({ kind: "key", layer: 1, row: 2, col: 3 })), {
    kind: "key",
    layer: 1,
    row: 2,
    col: 3,
  });
  deepStrictEqual(toWriteTarget(entry({ kind: "encoder", layer: 0, index: 1, direction: "cw" })), {
    kind: "encoder",
    layer: 0,
    index: 1,
    direction: 1,
  });
  deepStrictEqual(toWriteTarget(entry({ kind: "setting", qsid: 7 })), { kind: "setting", qsid: 7 });
  strictEqual(toWriteTarget(entry({ kind: "key", layer: -1, row: 0, col: 0 })), undefined);
  strictEqual(toWriteTarget(entry({ kind: "macro", index: 0 })), undefined);
});

test("差分が0件ならgateを作らない", () => {
  strictEqual(
    buildApplyGate({
      document: current,
      definition,
      binding,
      device,
      deviceDefinitionDigest: "abc",
      changed: [],
      acknowledged: [],
    }),
    undefined,
  );
});

test("実機definitionのdigestがbindingと異なればerrorでApplyを止める", () => {
  const desired = setKeyAssignment(current, { layer: 0, row: 0, col: 0 }, "KC_B");
  const changed = diffDocuments(current, desired, definition).entries;
  ok(changed.length > 0);
  const matched = buildApplyGate({
    document: desired,
    definition,
    binding,
    device,
    deviceDefinitionDigest: "abc",
    changed,
    acknowledged: [],
  });
  ok(matched !== undefined);
  strictEqual(
    matched.fatal.some((diagnostic) => diagnostic.code === "compatibility/definition-mismatch"),
    false,
  );
  const mismatched = buildApplyGate({
    document: desired,
    definition,
    binding,
    device,
    deviceDefinitionDigest: undefined,
    changed,
    acknowledged: [],
  });
  ok(mismatched !== undefined);
  strictEqual(mismatched.allowed, false);
  ok(
    mismatched.fatal.some((diagnostic) => diagnostic.code === "compatibility/definition-mismatch"),
  );
});

test("write未対応の差分はapply/unsupported-changeとして数える", () => {
  const desired = setKeyAssignment(current, { layer: 0, row: 0, col: 0 }, "KC_B");
  const changed = [
    ...diffDocuments(current, desired, definition).entries,
    entry({ kind: "macro", index: 0 }),
  ];
  const gate = buildApplyGate({
    document: desired,
    definition,
    binding,
    device,
    deviceDefinitionDigest: "abc",
    changed,
    acknowledged: [],
  });
  ok(gate !== undefined);
  const unsupported = gate.fatal.find(
    (diagnostic) => diagnostic.code === "apply/unsupported-change",
  );
  strictEqual(unsupported?.details.count, 1);
});

test("Applyを開始できない理由を前提条件の順に1つだけ返す", () => {
  const ready = { cornixReady: true, connected: true, read: true, changedCount: 2, fatalCount: 0 };
  strictEqual(applyBlockedReason(ready), undefined);
  strictEqual(
    applyBlockedReason({ ...ready, cornixReady: false, connected: false }),
    "keymap.yaml を読み込めていない",
  );
  strictEqual(
    applyBlockedReason({ ...ready, connected: false, read: false }),
    "実機に接続していない",
  );
  strictEqual(applyBlockedReason({ ...ready, read: false }), "この接続で実機を読み込んでいない");
  strictEqual(applyBlockedReason({ ...ready, changedCount: 0 }), "実機との差分が 0 件");
  strictEqual(
    applyBlockedReason({ ...ready, fatalCount: 3 }),
    "error が 3 件あるため Apply できない",
  );
});

test("書き込みの往復回数はoperationごとにwriteとverifyの2往復で数える", () => {
  strictEqual(applyRoundTripTotal(undefined), 0);
  strictEqual(applyRoundTripTotal({ phase: "completed", verified: [] }), 0);
  strictEqual(applyRoundTripTotal({ phase: "aborted", reason: "timeout", verified: 1 }), 0);
});
