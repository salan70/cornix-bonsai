import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import { NOT_IMPLEMENTED_COMMANDS, ROUND_TRIP_TIMEOUT_MS, WRITE_COMMANDS } from "./commands.ts";
import {
  abortApply,
  ApplyPreconditionError,
  assertSameDevice,
  confirmApply,
  createApplyPlan,
  createRollbackPlan,
  recordVerifyResult,
  targetKey,
  type ApplyState,
  type DeviceSnapshot,
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

test("backupが空ならApply計画を作れない", () => {
  // ADR 0005: backupが取れなければwriteへ進まない。
  throws(() => createApplyPlan(snapshot({}), DESIRED, TARGETS), ApplyPreconditionError);
});

test("差分は変化したentryだけになる", () => {
  const plan = createApplyPlan(BACKUP, DESIRED, TARGETS);

  strictEqual(plan.operations.length, 2);
  deepStrictEqual(
    plan.operations.map((op) => targetKey(op.target)),
    ["key:0:0:1", "encoder:0:0:0"],
  );
});

test("backupにも目標にも無いtargetは差分に含めない", () => {
  // 容量は実機が申告する（ADR 0003）。host側が実機の持たないentryを推測して書かない。
  const plan = createApplyPlan(BACKUP, DESIRED, [...TARGETS, { kind: "tapDance", index: 99 }]);

  strictEqual(plan.operations.length, 2);
});

test("再readが一致すればひとつ進み、全件でcompletedになる", () => {
  const plan = createApplyPlan(BACKUP, DESIRED, TARGETS);
  let state: ApplyState = confirmApply(plan);

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
  const plan = createApplyPlan(BACKUP, DESIRED, TARGETS);
  const state = recordVerifyResult(confirmApply(plan), [0x0000]);

  strictEqual(state.phase, "aborted");
  if (state.phase !== "aborted") return;
  strictEqual(state.reason, "verify-mismatch");
  strictEqual(state.verified, 0);
});

test("中断したstateは未完了の差分を持ち回らない", () => {
  // ADR 0005: 中断したら再接続後に全readからやり直す。
  // 残りのoperationもplanも持たないので、そもそも再開しようがない形にする。
  const plan = createApplyPlan(BACKUP, DESIRED, TARGETS);
  const aborted = abortApply(confirmApply(plan), "disconnected");

  strictEqual(aborted.phase, "aborted");
  ok(!("plan" in aborted));
  ok(!("cursor" in aborted));
});

test("中断したstateへは再read結果を渡せない", () => {
  const plan = createApplyPlan(BACKUP, DESIRED, TARGETS);
  const aborted = abortApply(confirmApply(plan), "timeout");

  throws(() => recordVerifyResult(aborted, [0x0006]), ApplyPreconditionError);
});

test("差分が無ければwriteを始めずに完了する", () => {
  const plan = createApplyPlan(BACKUP, BACKUP.values, TARGETS);
  const state = confirmApply(plan);

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
  const plan = createRollbackPlan(BACKUP, current, TARGETS);

  deepStrictEqual(
    plan.operations.map((op) => [targetKey(op.target), op.after]),
    [
      ["key:0:0:1", [0x0005]],
      ["encoder:0:0:0", [0x0080]],
    ],
  );
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
