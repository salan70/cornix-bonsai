/**
 * validation結果とApply対象を結びつける evidence。
 *
 * gateだけを別のdesiredへ持ち回ると、古いwarning acknowledgeを新しい内容へ流用できる。
 * evidenceはvalidation対象のcontextとdesired fingerprintを同じ値として保持し、Apply側が
 * 独立したcontextを差し込めない形にする。
 */

import type { Capacities } from "../keycode/table.ts";
import type { Diagnostic } from "./types.ts";

/** Apply対象とvalidation結果の対応づけ。 */
export interface ApplyValidationContext {
  /** validationした実機のkeyboard UID。 */
  readonly keyboardUid: string;
  /** validationしたkeyboard definitionのworkspace上の対応づけ。 */
  readonly definition: {
    readonly path: string;
    readonly digest: string;
  };
  /** validationに使った実機申告の容量。 */
  readonly capacities: Capacities;
  /** validationに使った実機申告の対応qsid。 */
  readonly supportedQsids: readonly number[];
}

/** `validateKeymap`がApply用evidenceを作るときに受け取るdefinition bindingとdesired identity。 */
export interface ApplyValidationIdentity {
  readonly definition: ApplyValidationContext["definition"];
  /** `fingerprintApplyValues(desired)`の結果。 */
  readonly desiredFingerprint: string;
}

const VALIDATION_EVIDENCE = Symbol("ValidationEvidence");

/** validationした診断・対象context・desiredを同じ入力として表すbranded evidence。 */
export interface ValidationEvidence {
  readonly diagnostics: readonly Diagnostic[];
  readonly context: ApplyValidationContext;
  readonly desiredFingerprint: string;
  /** evidence全体の決定的な識別子。 */
  readonly inputFingerprint: string;
  readonly [VALIDATION_EVIDENCE]: true;
}

/** validation entrypointが診断とApply対象identityを結びつけるconstructor。 */
export function createValidationEvidence(
  diagnostics: readonly Diagnostic[],
  context: ApplyValidationContext,
  desiredFingerprint: string,
): ValidationEvidence {
  const copiedContext = copyContext(context);
  const copiedDiagnostics = Object.freeze([...diagnostics]);
  const inputFingerprint = hashFingerprint(
    JSON.stringify([
      "validation-evidence-v1",
      copiedContext,
      desiredFingerprint,
      copiedDiagnostics.map((diagnostic) => [diagnostic.id, diagnostic.severity]),
    ]),
  );

  return {
    diagnostics: copiedDiagnostics,
    context: copiedContext,
    desiredFingerprint,
    inputFingerprint,
    [VALIDATION_EVIDENCE]: true,
  };
}

/** desired wire valuesを順序に依存しない決定的なfingerprintへ変換する。 */
export function fingerprintApplyValues(values: ReadonlyMap<string, readonly number[]>): string {
  const canonical = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, [...value]]);
  return hashFingerprint(JSON.stringify(["apply-values-v1", canonical]));
}

export function isValidationEvidence(value: unknown): value is ValidationEvidence {
  return typeof value === "object" && value !== null && VALIDATION_EVIDENCE in value;
}

function copyContext(context: ApplyValidationContext): ApplyValidationContext {
  return {
    keyboardUid: context.keyboardUid,
    definition: { ...context.definition },
    capacities: { ...context.capacities },
    supportedQsids: Object.freeze([...context.supportedQsids].sort((a, b) => a - b)),
  };
}

function hashFingerprint(source: string): string {
  let first = 0x811c9dc5;
  let second = 5381;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = (Math.imul(second, 33) ^ code) >>> 0;
  }
  return `v1-${first.toString(16).padStart(8, "0")}-${second.toString(16).padStart(8, "0")}`;
}
