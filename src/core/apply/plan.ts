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

/** writeの単位。比較単位はADR 0003 のまま。 */
export type WriteTarget =
  | { readonly kind: "key"; readonly layer: number; readonly row: number; readonly col: number }
  | {
      readonly kind: "encoder";
      readonly layer: number;
      readonly index: number;
      readonly direction: number;
    }
  | { readonly kind: "tapDance"; readonly index: number }
  | { readonly kind: "combo"; readonly index: number }
  | { readonly kind: "setting"; readonly qsid: number };

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
  | "user-cancelled"
  | "uid-mismatch";

/** Applyの前提条件が満たされていないときに投げる。 */
export class ApplyPreconditionError extends Error {}

/** `WriteTarget`を`DeviceSnapshot`のkeyへ直列化する。 */
export function targetKey(target: WriteTarget): string {
  switch (target.kind) {
    case "key":
      return `key:${target.layer}:${target.row}:${target.col}`;
    case "encoder":
      return `encoder:${target.layer}:${target.index}:${target.direction}`;
    case "tapDance":
      return `tapDance:${target.index}`;
    case "combo":
      return `combo:${target.index}`;
    case "setting":
      return `setting:${target.qsid}`;
  }
}

const COMMAND_FOR: Record<WriteTarget["kind"], WriteCommandKind> = {
  key: "key",
  encoder: "encoder",
  tapDance: "tapDance",
  combo: "combo",
  setting: "setting",
};

/**
 * backupと目標状態からApply計画を作る。
 *
 * **backupが無ければ計画を作れない**。これがADR 0005 の「backupが取れなければwriteへ
 * 進まない」の実体で、上位のフラグではなく型と引数で強制する。
 *
 * `desired`にあって`backup`に無いtargetは、実機がそのentryを持たない（容量外の）可能性が
 * あるため差分に含めない。容量は実機が申告するものであり、host側が推測してはいけない（ADR 0003）。
 *
 * @doc docs/specs/apply-flow.md#createapplyplan
 */
export function createApplyPlan(
  backup: DeviceSnapshot,
  desired: ReadonlyMap<string, readonly number[]>,
  targets: readonly WriteTarget[],
): ApplyPlan {
  if (backup.values.size === 0) {
    throw new ApplyPreconditionError("backupが空。全readを終えてからApply計画を作る");
  }

  const operations: WriteOperation[] = [];
  for (const target of targets) {
    const key = targetKey(target);
    const before = backup.values.get(key);
    const after = desired.get(key);
    if (before === undefined || after === undefined) continue;
    if (sameValue(before, after)) continue;
    operations.push({ target, command: COMMAND_FOR[target.kind], before, after });
  }

  return { backup, operations };
}

/** 人間の確認を受けてwriteを開始する。 */
export function confirmApply(plan: ApplyPlan): ApplyState {
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
 * として定義される（ADR 0005）。したがって専用の経路を持たず、`createApplyPlan`を
 * 向きを変えて呼ぶだけになる。
 */
export function createRollbackPlan(
  backup: DeviceSnapshot,
  current: DeviceSnapshot,
  targets: readonly WriteTarget[],
): ApplyPlan {
  return createApplyPlan(current, backup.values, targets);
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
