/**
 * Applyの状態機械。
 *
 * ADR 0005 が確定させた手順を、実機I/Oから切り離した純関数として表現する。
 *
 * ```text
 * 全read backup → validation → diff → 人間確認 → 1件ずつwrite + 再read
 *   → 失敗したら中断し、全readからやり直す
 * ```
 *
 * この module はWebHIDにもReactにもfilesystemにも依存しない（AGENTS.md設計ルール）。
 * 実機との往復はadapterが行い、その結果だけをここへ渡す。
 */

import type { WriteCommandKind } from "./commands.ts";
import { targetKey, type WriteTarget } from "./targets.ts";
import {
  assertApplyAllowed,
  type ApplyAllowedValidation,
  type ApplyGateWithEvidence,
} from "../validation/gate.ts";
import { isValidationEvidence, type ValidationEvidence } from "../validation/validate.ts";

export { targetKey, type WriteTarget } from "./targets.ts";

/**
 * 差分1件。
 *
 * 値はwire値（u16、またはentryごとのfield列）。名前へ変換しない（ADR 0003）。
 * `before`はbackupの値で、rollbackはこれを同じ差分write経路で書き戻す操作として定義される。
 */
export interface WriteOperation {
  readonly target: WriteTarget;
  readonly command: WriteCommandKind;
  readonly before: readonly number[];
  readonly after: readonly number[];
}

/** 人間の確認を待っているApply計画。 */
export interface ApplyPlan {
  /** backupを取った時点の実機の状態。rollbackの復元元。 */
  readonly backup: DeviceSnapshot;
  readonly operations: readonly WriteOperation[];
  /** validation時点の対象対応。plan fingerprintにも含まれる。 */
  readonly validation: {
    readonly gate: ApplyAllowedValidation;
    readonly evidence: ValidationEvidence;
  };
  /** 人間確認したplanとwriteするplanを結びつける決定的な識別子。 */
  readonly fingerprint: string;
}

/**
 * 全readで取った実機の状態。
 *
 * Applyの必須の前提条件。**backupが取れなければwriteへ進まない**（ADR 0005）。
 * firmwareにrollback機能は無く、復元元はhost側のbackupしか存在しない。
 */
export interface DeviceSnapshot {
  readonly keyboardUid: string;
  /** target を直列化したkey → wire値。 */
  readonly values: ReadonlyMap<string, readonly number[]>;
  readonly readAt: number;
}

/** Applyの進行状態。 */
export type ApplyState =
  | { readonly phase: "awaitingConfirmation"; readonly plan: ApplyPlan }
  | {
      readonly phase: "writing";
      readonly plan: ApplyPlan;
      /** 次に書くoperationの位置。 */
      readonly cursor: number;
      /** 再readで一致を確認できたoperation。 */
      readonly verified: readonly WriteOperation[];
    }
  | { readonly phase: "completed"; readonly verified: readonly WriteOperation[] }
  /**
   * 中断。**未完了の差分を持たない**（ADR 0005）。
   * 再開には全readからのやり直しが要る。
   */
  | { readonly phase: "aborted"; readonly reason: AbortReason; readonly verified: number };

export type AbortReason =
  | "verify-mismatch"
  | "timeout"
  | "disconnected"
  | "protocol-error"
  | "user-cancelled"
  | "uid-mismatch";

/** Applyの前提条件が満たされていないときに投げる。 */
export class ApplyPreconditionError extends Error {}

const VALIDATED_APPLY_INPUT = Symbol("ValidatedApplyInput");

/**
 * gateを通過し、full-read coverageと対象対応を検証済みのApply入力。
 * この型を作る公開関数がevidence付きgateを`ApplyAllowedValidation`へ変換する唯一の経路になる。
 */
export interface ValidatedApplyInput {
  readonly gate: ApplyAllowedValidation;
  readonly backup: DeviceSnapshot;
  readonly desired: ReadonlyMap<string, readonly number[]>;
  readonly targets: readonly WriteTarget[];
  readonly [VALIDATED_APPLY_INPUT]: true;
}

const COMMAND_FOR: Record<WriteTarget["kind"], WriteCommandKind> = {
  key: "key",
  encoder: "encoder",
  tapDance: "tapDance",
  combo: "combo",
  setting: "setting",
};

/**
 * validation gateと全read結果をApply専用の入力へ変換する。
 *
 * gateが閉じている場合、またはdesiredのentryをfull-read backupでcoverageできない場合は
 * `ValidatedApplyInput`を返さない。`createApplyPlan`はこの型だけを受け取るため、validationを
 * 通さずにplanへ進む公開API経路がない。
 *
 * @doc docs/specs/apply-flow.md#createvalidatedapplyinput
 */
export function createValidatedApplyInput(
  gate: ApplyGateWithEvidence,
  backup: DeviceSnapshot,
): ValidatedApplyInput {
  if (!isValidationEvidence(gate.evidence)) {
    throw new ApplyPreconditionError("validation evidenceが不正");
  }
  const allowedGate = assertApplyAllowed(gate);
  if (backup.values.size === 0) {
    throw new ApplyPreconditionError("backupが空。全readを終えてからApply入力を作る");
  }
  const context = gate.evidence.context;
  if (context.keyboardUid.length === 0) {
    throw new ApplyPreconditionError("validation対象のkeyboard UIDが空");
  }
  if (context.definition.path.length === 0 || context.definition.digest.length === 0) {
    throw new ApplyPreconditionError("validation対象のdefinition bindingが不完全");
  }
  assertSameDevice(backup, context.keyboardUid);
  const { desired, targets } = gate.evidence;

  const targetKeys = targets.map(targetKey);
  if (new Set(targetKeys).size !== targetKeys.length) {
    throw new ApplyPreconditionError("Apply対象に重複したtargetがある");
  }
  const targetKeySet = new Set(targetKeys);
  for (const key of desired.keys()) {
    if (!targetKeySet.has(key)) {
      throw new ApplyPreconditionError(`desiredのtarget ${key} がApply対象に含まれていない`);
    }
    if (!backup.values.has(key)) {
      throw new ApplyPreconditionError(
        `desiredのtarget ${key} がfull-read backupに無い。partial stateをApplyできない`,
      );
    }
  }

  return {
    gate: allowedGate,
    backup: copySnapshot(backup),
    desired: copyValues(desired),
    targets: Object.freeze(targets.map((target) => Object.freeze({ ...target }))),
    [VALIDATED_APPLY_INPUT]: true,
  };
}

/**
 * backupと目標状態からApply計画を作る。
 *
 * **backupが無ければ計画を作れない**。これがADR 0005 の「backupが取れなければwriteへ
 * 進まない」の実体で、`ValidatedApplyInput`の型と引数で強制する。
 *
 * `desired`にあって`backup`に無いtargetは、実機がそのentryを持たない（容量外の）可能性が
 * あるため、`createValidatedApplyInput`でprecondition errorにする。容量は実機が申告する
 * ものであり、host側が推測してはいけない（ADR 0003）。
 *
 * @doc docs/specs/apply-flow.md#createapplyplan
 */
export function createApplyPlan(input: ValidatedApplyInput): ApplyPlan {
  if (!input[VALIDATED_APPLY_INPUT]) {
    throw new ApplyPreconditionError("validation済みのApply入力が必要");
  }

  const operations: WriteOperation[] = [];
  for (const target of input.targets) {
    const key = targetKey(target);
    const before = input.backup.values.get(key);
    const after = input.desired.get(key);
    if (after === undefined) continue;
    if (before === undefined) {
      throw new ApplyPreconditionError(
        `desiredのtarget ${key} がfull-read backupに無い。partial stateをApplyできない`,
      );
    }
    if (sameValue(before, after)) continue;
    operations.push({ target, command: COMMAND_FOR[target.kind], before, after });
  }

  const plan = {
    backup: input.backup,
    operations: Object.freeze(operations),
    validation: { gate: input.gate, evidence: input.gate.evidence },
    fingerprint: fingerprint(input),
  } satisfies ApplyPlan;
  return plan;
}

/** 人間が確認したfingerprintとplanが一致するときだけwriteを開始する。 */
/** @doc docs/specs/apply-flow.md#confirmapply */
export function confirmApply(plan: ApplyPlan, confirmedFingerprint: string): ApplyState {
  if (confirmedFingerprint !== plan.fingerprint) {
    throw new ApplyPreconditionError("確認したdiffとApply planが一致しない");
  }
  if (plan.operations.length === 0) {
    return { phase: "completed", verified: [] };
  }
  return { phase: "writing", plan, cursor: 0, verified: [] };
}

/**
 * 1件writeした後の**再read結果**を受けて状態を進める。
 *
 * 引数はackではなく再readで得たwire値である。**ackを成功と見なさない**（ADR 0005）。
 * RMKの応答は`output_data`のechoで成否を示すbyteが無く、範囲外indexへのwriteも
 * 成功コード0を返すため、ackからは何も判定できない。
 *
 * 一致しなければそこで中断する。
 *
 * @doc docs/specs/apply-flow.md#recordverifyresult
 */
export function recordVerifyResult(state: ApplyState, observed: readonly number[]): ApplyState {
  if (state.phase !== "writing") {
    throw new ApplyPreconditionError(`phase ${state.phase} では再read結果を受け取れない`);
  }

  const operation = state.plan.operations[state.cursor];
  if (operation === undefined) {
    throw new ApplyPreconditionError("cursorがoperationの範囲外");
  }

  if (!sameValue(operation.after, observed)) {
    return { phase: "aborted", reason: "verify-mismatch", verified: state.verified.length };
  }

  const verified = [...state.verified, operation];
  const cursor = state.cursor + 1;
  if (cursor >= state.plan.operations.length) {
    return { phase: "completed", verified };
  }
  return { phase: "writing", plan: state.plan, cursor, verified };
}

/**
 * Applyを中断する。
 *
 * **未完了の差分を状態として持ち回らない**（ADR 0005）。返す状態は検証済みの件数しか
 * 持たず、残りのoperationもplanも捨てる。再開したい場合は再接続して全readからやり直し、
 * diffを取り直す。
 *
 * 電源断を挟んだ場合、**最後にackが返った1 entryは反映されていない可能性がある**。
 * 「ackが返ったのだから書けているはず」という前提で次のdiffを縮めてはいけない。
 * 全readはその状態を正しく返すので、取り直せば埋まる。
 *
 * @doc docs/specs/apply-flow.md#abortapply
 */
export function abortApply(state: ApplyState, reason: AbortReason): ApplyState {
  const verified = state.phase === "writing" ? state.verified.length : 0;
  return { phase: "aborted", reason, verified };
}

/**
 * backupの値へ戻すApply計画を作る。
 *
 * rollbackはfirmwareの機能ではなく、**backupの値を同じ差分write経路で書き戻す操作**
 * として定義される（ADR 0005）。rollback側のvalidation evidenceを別途受け取り、対象
 * contextが元のApplyと一致することを確認してから`createApplyPlan`へ渡す。
 */
export function createRollbackPlan(
  input: ValidatedApplyInput,
  rollbackGate: ApplyGateWithEvidence,
  current: DeviceSnapshot,
): ApplyPlan {
  if (
    JSON.stringify(input.gate.evidence.context) !== JSON.stringify(rollbackGate.evidence.context)
  ) {
    throw new ApplyPreconditionError("rollbackのvalidation対象contextがApplyと一致しない");
  }
  if (
    JSON.stringify(input.targets.map(targetKey)) !==
    JSON.stringify(rollbackGate.evidence.targets.map(targetKey))
  ) {
    throw new ApplyPreconditionError("rollbackのvalidation対象targetが元のApplyと一致しない");
  }
  for (const target of input.targets) {
    const key = targetKey(target);
    const backupValue = input.backup.values.get(key);
    const rollbackValue = rollbackGate.evidence.desired.get(key);
    if (
      backupValue === undefined ||
      rollbackValue === undefined ||
      !sameValue(backupValue, rollbackValue)
    ) {
      throw new ApplyPreconditionError("rollbackのvalidation済みdesiredが元のbackupと一致しない");
    }
  }
  return createApplyPlan(createValidatedApplyInput(rollbackGate, current));
}

/**
 * backupが今つながっている実機のものかを確かめる。
 *
 * 別のキーボードのbackupで差分writeすると、意味の違う値を書き込む。
 */
export function assertSameDevice(backup: DeviceSnapshot, keyboardUid: string): void {
  if (backup.keyboardUid !== keyboardUid) {
    throw new ApplyPreconditionError(
      `backupは別のキーボードのもの（backup=${backup.keyboardUid} device=${keyboardUid}）`,
    );
  }
}

function sameValue(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function copyValues(
  values: ReadonlyMap<string, readonly number[]>,
): ReadonlyMap<string, readonly number[]> {
  return new Map(
    [...values.entries()].map(([key, value]) => [
      key,
      Object.freeze([...value]) as readonly number[],
    ]),
  );
}

function copySnapshot(snapshot: DeviceSnapshot): DeviceSnapshot {
  return { ...snapshot, values: copyValues(snapshot.values) };
}

/** planの全入力を順序を固定して表現する。表示用ではなく同一性確認用。 */
function fingerprint(input: ValidatedApplyInput): string {
  const source = JSON.stringify([
    "apply-plan-v1",
    input.gate.evidence.inputFingerprint,
    input.targets.map(serializeTarget),
    serializeSnapshot(input.backup),
    serializeValues(input.desired),
    input.gate.fatal.map((diagnostic) => diagnostic.id),
    input.gate.acknowledgeable.map((diagnostic) => diagnostic.id),
  ]);

  let first = 0x811c9dc5;
  let second = 5381;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = (Math.imul(second, 33) ^ code) >>> 0;
  }
  return `v1-${first.toString(16).padStart(8, "0")}-${second.toString(16).padStart(8, "0")}`;
}

function serializeSnapshot(snapshot: DeviceSnapshot): unknown {
  return [snapshot.keyboardUid, snapshot.readAt, serializeValues(snapshot.values)];
}

function serializeValues(values: ReadonlyMap<string, readonly number[]>): readonly unknown[] {
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, [...value]]);
}

function serializeTarget(target: WriteTarget): string {
  return `${targetKey(target)}:${target.kind}`;
}
