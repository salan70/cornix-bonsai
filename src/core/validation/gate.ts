/**
 * Apply gate。**severity と Apply blocking を接続する唯一の場所**。
 *
 * ADR 0008 の状態機械は validation の結果を引数に取っていない。その接続点をここに置く
 * （ADR 0010）。`createApplyPlan` を呼ぶ前に `assertApplyAllowed` を通すのが規約で、
 * gate 自身は実機にも UI にも依存しない純関数。
 *
 * 境界（ADR 0010）:
 *   - `error`       : 常に block。acknowledge できない
 *   - `warning`     : 既定で block。**診断 id 単位の acknowledge で越えられる**
 *   - `information` : block しない
 *
 * warning を非 blocking にしない理由は、warning の中身が「Vial が無言で KC_NO へ落とす」
 * 「実機が操作不能になる」といった**静かに壊れる**事実だから。逆に error にすると、
 * 正当な編集（definition より新しい keymap など）で Apply が永久に不可能になる。
 * だから「止めるが、人間が個別に越えられる」にする。これが AGENTS.md の Apply フローに
 * ある「人間が確認」の実体になる。
 */

import type { Diagnostic } from "./types.ts";

/** Apply gate の判定結果。 */
export interface ApplyGate {
  readonly allowed: boolean;
  /** Apply を止めている診断。 */
  readonly blocking: readonly Diagnostic[];
  /** acknowledge すれば越えられる診断（未 acknowledge の warning）。 */
  readonly acknowledgeable: readonly Diagnostic[];
  /** acknowledge できない診断（error）。 */
  readonly fatal: readonly Diagnostic[];
}

/** gate が閉じているのに Apply へ進もうとしたときに投げる。 */
export class ApplyBlockedError extends Error {}

/**
 * 診断と acknowledge 済み id から gate を判定する。
 *
 * acknowledge は診断の `id` 単位で、id には根拠の値の指紋が入っている（`types.ts`）。
 * したがって**同じ位置でも中身が変われば acknowledge は自動的に外れる**。
 *
 * @doc docs/specs/validation.md#evaluateapplygate
 */
export function evaluateApplyGate(
  diagnostics: readonly Diagnostic[],
  acknowledgedIds: readonly string[] = [],
): ApplyGate {
  const acknowledged = new Set(acknowledgedIds);
  const fatal = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const acknowledgeable = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning" && !acknowledged.has(diagnostic.id),
  );
  const blocking = [...fatal, ...acknowledgeable];

  return { allowed: blocking.length === 0, blocking, acknowledgeable, fatal };
}

/**
 * gate が開いていることを確かめる。開いていなければ投げる。
 *
 * **Apply の入口はこれ 1 か所にする**。`createApplyPlan` の前に必ず通す。上位のフラグで
 * 分岐させる方式を採らないのは ADR 0008 と同じ理由で、分岐は消し忘れると効かなくなる。
 *
 * @doc docs/specs/validation.md#assertapplyallowed
 */
export function assertApplyAllowed(gate: ApplyGate): void {
  if (gate.allowed) return;
  const codes = gate.blocking.map((diagnostic) => diagnostic.code).join(", ");
  throw new ApplyBlockedError(
    `validation が Apply を止めている（error ${gate.fatal.length} 件 / 未確認の warning ${gate.acknowledgeable.length} 件）: ${codes}`,
  );
}
