import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { NOT_IMPLEMENTED_COMMANDS, ROUND_TRIP_TIMEOUT_MS, WRITE_COMMANDS } from "./commands.ts";
import { ApplyBlockedError, assertApplyAllowed, evaluateApplyGate } from "../validation/gate.ts";
import {
  fingerprintApplyValues,
  type ApplyValidationContext,
  type ValidationEvidence,
} from "../validation/evidence.ts";
import { parseDefinition } from "../definition/parse.ts";
import { parseVil } from "../vil/parse.ts";
import { validateKeymap } from "../validation/validate.ts";
import type { DeviceProfile } from "../validation/compatibility.ts";
import {
  abortApply,
  ApplyPreconditionError,
  assertSameDevice,
  confirmApply,
  createApplyPlan,
  createRollbackPlan,
  createValidatedApplyInput,
  recordVerifyResult,
  targetKey,
  type ApplyState,
  type DeviceSnapshot,
  type ValidatedApplyInput,
  type WriteTarget,
} from "./plan.ts";

const TARGETS: readonly WriteTarget[] = [
  { kind: "key", layer: 0, row: 0, col: 0 },
  { kind: "key", layer: 0, row: 0, col: 1 },
  { kind: "encoder", layer: 0, index: 0, direction: 0 },
];

function snapshot(values: Record<string, number[]>, uid = "16882930253541522617"): DeviceSnapshot {
  return {
    keyboardUid: uid,
    values: new Map(Object.entries(values)),
    readAt: 0,
  };
}

const BACKUP = snapshot({
  "key:0:0:0": [0x0004],
  "key:0:0:1": [0x0005],
  "encoder:0:0:0": [0x0080],
});

const DESIRED = new Map<string, readonly number[]>([
  ["key:0:0:0", [0x0004]], // 変化なし
  ["key:0:0:1", [0x0006]],
  ["encoder:0:0:0", [0x0081]],
]);

const VALIDATION_CONTEXT: ApplyValidationContext = {
  keyboardUid: BACKUP.keyboardUid,
  definition: { path: "cornix/definitions/test.json", digest: "definition-digest" },
  capacities: { layerCount: 10, macroCount: 32, tapDanceCount: 32, comboCount: 32 },
  supportedQsids: [2, 6, 7, 18, 19, 22, 23, 26, 27],
};

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const VALIDATION_DEFINITION = parseDefinition(
  readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
);

function validationEvidenceFor(
  desired: ReadonlyMap<string, readonly number[]>,
  context: ApplyValidationContext = VALIDATION_CONTEXT,
  fixture = "baseline.vil",
  keyboardUid = context.keyboardUid,
): ValidationEvidence {
  const document = parseVil(readFileSync(join(FIXTURES, fixture), "utf8"));
  const device: DeviceProfile = {
    keyboardUid,
    capacities: context.capacities,
    supportedQsids: context.supportedQsids,
  };
  const result = validateKeymap(document, VALIDATION_DEFINITION, device, {
    definition: context.definition,
    desiredFingerprint: fingerprintApplyValues(desired),
  });
  if (result.evidence === undefined) throw new Error("test evidenceが生成されなかった");
  return result.evidence;
}

function validated(
  backup: DeviceSnapshot = BACKUP,
  desired: ReadonlyMap<string, readonly number[]> = DESIRED,
  targets: readonly WriteTarget[] = TARGETS,
): ValidatedApplyInput {
  const evidence = validationEvidenceFor(desired);
  return createValidatedApplyInput(evaluateApplyGate(evidence), backup, desired, targets);
}

test("backupが空ならApply計画を作れない", () => {
  // ADR 0005: backupが取れなければwriteへ進まない。
  throws(
    () =>
      createValidatedApplyInput(
        evaluateApplyGate(validationEvidenceFor(DESIRED)),
        snapshot({}),
        DESIRED,
        TARGETS,
      ),
    ApplyPreconditionError,
  );
});

test("差分は変化したentryだけになる", () => {
  const plan = createApplyPlan(validated());

  strictEqual(plan.operations.length, 2);
  deepStrictEqual(
    plan.operations.map((op) => targetKey(op.target)),
    ["key:0:0:1", "encoder:0:0:0"],
  );
});

test("backupにも目標にも無いtargetは差分に含めない", () => {
  // 容量は実機が申告する（ADR 0003）。host側が実機の持たないentryを推測して書かない。
  const plan = createApplyPlan(
    validated(BACKUP, DESIRED, [...TARGETS, { kind: "tapDance", index: 99 }]),
  );

  strictEqual(plan.operations.length, 2);
});

test("desiredにあるbackup未収載targetはsilent skipせず拒否する", () => {
  const desired = new Map(DESIRED);
  desired.set("tapDance:99", [0x0001]);

  throws(
    () => validated(BACKUP, desired, [...TARGETS, { kind: "tapDance", index: 99 }]),
    ApplyPreconditionError,
  );
});

test("gateを通過しない入力はApply入力にならない", () => {
  const gate = evaluateApplyGate(
    validationEvidenceFor(DESIRED, VALIDATION_CONTEXT, "baseline.vil", "1"),
  );

  throws(() => createValidatedApplyInput(gate, BACKUP, DESIRED, TARGETS), ApplyBlockedError);
});

test("validation済み入力なしではplanを生成できない", () => {
  throws(() => createApplyPlan({} as ValidatedApplyInput), ApplyPreconditionError);
});

test("再readが一致すればひとつ進み、全件でcompletedになる", () => {
  const plan = createApplyPlan(validated());
  let state: ApplyState = confirmApply(plan, plan.fingerprint);

  strictEqual(state.phase, "writing");
  state = recordVerifyResult(state, [0x0006]);
  strictEqual(state.phase, "writing");
  state = recordVerifyResult(state, [0x0081]);

  strictEqual(state.phase, "completed");
  if (state.phase !== "completed") return;
  strictEqual(state.verified.length, 2);
});

test("再readが一致しなければそこで中断する", () => {
  // ackは成功を意味しない。判定材料は再readの値だけ（ADR 0005）。
  const plan = createApplyPlan(validated());
  const state = recordVerifyResult(confirmApply(plan, plan.fingerprint), [0x0000]);

  strictEqual(state.phase, "aborted");
  if (state.phase !== "aborted") return;
  strictEqual(state.reason, "verify-mismatch");
  strictEqual(state.verified, 0);
});

test("中断したstateは未完了の差分を持ち回らない", () => {
  // ADR 0005: 中断したら再接続後に全readからやり直す。
  // 残りのoperationもplanも持たないので、そもそも再開しようがない形にする。
  const plan = createApplyPlan(validated());
  const aborted = abortApply(confirmApply(plan, plan.fingerprint), "disconnected");

  strictEqual(aborted.phase, "aborted");
  ok(!("plan" in aborted));
  ok(!("cursor" in aborted));
});

test("中断したstateへは再read結果を渡せない", () => {
  const plan = createApplyPlan(validated());
  const aborted = abortApply(confirmApply(plan, plan.fingerprint), "timeout");

  throws(() => recordVerifyResult(aborted, [0x0006]), ApplyPreconditionError);
});

test("差分が無ければwriteを始めずに完了する", () => {
  const plan = createApplyPlan(validated(BACKUP, BACKUP.values));
  const state = confirmApply(plan, plan.fingerprint);

  strictEqual(plan.operations.length, 0);
  strictEqual(state.phase, "completed");
});

test("rollbackはbackupの値を同じ差分write経路で書き戻す", () => {
  // firmwareにrollback機能は無い。専用経路を持たないことが設計上の主張（ADR 0005）。
  const current = snapshot({
    "key:0:0:0": [0x0004],
    "key:0:0:1": [0x0006],
    "encoder:0:0:0": [0x0081],
  });
  const rollbackGate = evaluateApplyGate(validationEvidenceFor(BACKUP.values));
  const plan = createRollbackPlan(validated(), rollbackGate, current);

  deepStrictEqual(
    plan.operations.map((op) => [targetKey(op.target), op.after]),
    [
      ["key:0:0:1", [0x0005]],
      ["encoder:0:0:0", [0x0080]],
    ],
  );
});

test("確認fingerprintが違えばwriteを開始しない", () => {
  const plan = createApplyPlan(validated());

  throws(() => confirmApply(plan, "v1-stale"), ApplyPreconditionError);
});

test("plan fingerprintはvalidation対象のbindingと容量を含む", () => {
  const plan = createApplyPlan(validated());
  const changedContext = {
    ...VALIDATION_CONTEXT,
    definition: { ...VALIDATION_CONTEXT.definition, digest: "changed-definition-digest" },
    capacities: { ...VALIDATION_CONTEXT.capacities, layerCount: 11 },
  } satisfies ApplyValidationContext;
  const changed = createApplyPlan(
    createValidatedApplyInput(
      evaluateApplyGate(validationEvidenceFor(DESIRED, changedContext)),
      BACKUP,
      DESIRED,
      TARGETS,
    ),
  );

  ok(plan.fingerprint !== changed.fingerprint);
});

test("validation済みdesiredと異なるdesiredへ古いgateを流用できない", () => {
  const evidence = validationEvidenceFor(DESIRED);
  const gate = evaluateApplyGate(evidence);
  const changedDesired = new Map(DESIRED);
  changedDesired.set("key:0:0:1", [0x0007]);

  throws(
    () => createValidatedApplyInput(gate, BACKUP, changedDesired, TARGETS),
    ApplyPreconditionError,
  );
});

test("acknowledged warningを含む古いgateを内容変更後へ流用できない", () => {
  const warningContext = {
    ...VALIDATION_CONTEXT,
    supportedQsids: VALIDATION_CONTEXT.supportedQsids.filter((qsid) => qsid !== 27),
  } satisfies ApplyValidationContext;
  const evidence = validationEvidenceFor(DESIRED, warningContext);
  const warning = evidence.diagnostics.find((diagnostic) => diagnostic.severity === "warning");
  if (warning === undefined) throw new Error("test warningが生成されなかった");
  const gate = evaluateApplyGate(evidence, [warning.id]);
  const changedDesired = new Map(DESIRED);
  changedDesired.set("key:0:0:1", [0x0007]);

  throws(
    () => createValidatedApplyInput(gate, BACKUP, changedDesired, TARGETS),
    ApplyPreconditionError,
  );
});

test("別definitionのvalidation evidenceを既存Applyへ差し込めない", () => {
  const changedContext = {
    ...VALIDATION_CONTEXT,
    definition: { ...VALIDATION_CONTEXT.definition, digest: "changed-definition-digest" },
  } satisfies ApplyValidationContext;
  const rollbackGate = evaluateApplyGate(validationEvidenceFor(BACKUP.values, changedContext));

  throws(() => createRollbackPlan(validated(), rollbackGate, BACKUP), ApplyPreconditionError);
});

test("別のキーボードのbackupは拒否する", () => {
  assertSameDevice(BACKUP, "16882930253541522617");
  throws(() => assertSameDevice(BACKUP, "1"), ApplyPreconditionError);
});

test("write commandは単一entryの5種類だけ", () => {
  // AI / CLIからのwrite境界の実体。reset系はcommand tableに載せない（ADR 0005）。
  deepStrictEqual(Object.keys(WRITE_COMMANDS).sort(), [
    "combo",
    "encoder",
    "key",
    "setting",
    "tapDance",
  ]);

  const ids: number[] = Object.values(WRITE_COMMANDS).map((command) => command.id);
  ok(!ids.includes(0x13), "keymap bulk write は無い");
  ok(!ids.includes(0x0f), "macro buffer write は無い");
  ok(!ids.includes(0x0a), "EepromReset は無い");
  ok(!ids.includes(0x0b), "BootloaderJump は無い");
});

test("実装しないcommandは記録だけで送信経路を持たない", () => {
  const implemented = new Set<number>(Object.values(WRITE_COMMANDS).map((c) => c.id));
  for (const entry of NOT_IMPLEMENTED_COMMANDS) {
    const id = Number.parseInt(entry.slice(0, 4), 16);
    if (id === 0xfe) continue;
    ok(!implemented.has(id), `${entry} は許可リストに無い`);
  }
});

test("往復timeoutは3000msで確定している", () => {
  strictEqual(ROUND_TRIP_TIMEOUT_MS, 3000);
});
