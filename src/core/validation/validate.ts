/**
 * 4 つの責務を合成した入口。
 *
 * 段ごとに入力が増える。**入力が少ない段から先に走らせ、前提が崩れていたら後段を信じない**
 * という順序がそのまま責務分割になっている（ADR 0010）。
 *
 * | 段            | 入力                                  | 主な severity |
 * | ------------- | ------------------------------------- | ------------- |
 * | structure     | `VilDocument`                         | error         |
 * | compatibility | + keyboard definition                 | error/warning |
 * | reference     | + 容量（実機申告 or `.vil` 観測）     | warning       |
 * | reachability  | `VilDocument`（layer グラフのみ）     | warning       |
 * | device match  | + 実機の申告値                        | error/warning |
 */

import type { KeyboardDefinition } from "../definition/types.ts";
import { targetKey, type WriteTarget } from "../apply/targets.ts";
import { encodeVialKeycode } from "../keycode/wire.ts";
import type { Capacities } from "../keycode/table.ts";
import { observeCapacities } from "../model/keymap-view.ts";
import { isAbsent, type VilDocument } from "../vil/types.ts";
import { validateCompatibility, validateDeviceMatch, type DeviceProfile } from "./compatibility.ts";
import { toReachabilityDiagnostics } from "./reachability.ts";
import { validateReferences } from "./references.ts";
import { validateStructure } from "./structure.ts";
import { summarize, type Diagnostic, type DiagnosticSummary } from "./types.ts";

/** validation の結果。 */
export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: DiagnosticSummary;
}

/** workspace上のkeyboard definitionをcontent-addressedに特定する。 */
export interface DefinitionBinding {
  readonly path: string;
  readonly digest: string;
}

/** Apply対象とvalidation結果の対応づけ。 */
export interface ApplyValidationContext {
  readonly keyboardUid: string;
  readonly definition: DefinitionBinding;
  readonly capacities: Capacities;
  readonly supportedQsids: readonly number[];
}

const VALIDATION_EVIDENCE = Symbol("ValidationEvidence");

/** validationしたdocumentから内部導出したApply入力を保持するbranded evidence。 */
export interface ValidationEvidence {
  readonly diagnostics: readonly Diagnostic[];
  readonly context: ApplyValidationContext;
  readonly desired: ReadonlyMap<string, readonly number[]>;
  readonly targets: readonly WriteTarget[];
  readonly inputFingerprint: string;
  readonly [VALIDATION_EVIDENCE]: true;
}

/** Apply用validationの結果。desiredはcaller入力ではなくdocumentから導出される。 */
export interface ApplyValidationResult extends ValidationResult {
  readonly evidence: ValidationEvidence;
}

/** document上にApply targetの値が無い場合に投げる。 */
export class ApplyValueDerivationError extends Error {}

/**
 * keymap を検証する。`device` を渡すと実機との組み合わせ検証まで行う。
 *
 * `device` を渡した場合、容量は**実機の申告値**を使う。渡さない場合だけ `.vil` から
 * 観測した値で代用する（ADR 0003）。この分岐をここ 1 か所に閉じることで、
 * call site が誤って `.vil` 由来の容量を実機の容量として渡す経路を消している。
 *
 * @doc docs/specs/validation.md#validatekeymap
 */
export function validateKeymap(
  document: VilDocument,
  definition: KeyboardDefinition,
  device?: DeviceProfile,
): ValidationResult {
  const capacities: Capacities = device?.capacities ?? observeCapacities(document);
  const diagnostics = collectDiagnostics(document, definition, capacities, device);
  return { diagnostics, summary: summarize(diagnostics) };
}

/**
 * documentのvalidationとApply desired生成を同じ境界で行う。
 *
 * callerはdesiredやそのfingerprintを渡せない。write対象のwire値は、ここで実際に検証した
 * `VilDocument`からだけ導出し、非公開constructorでevidenceへ束ねる。
 *
 * @doc docs/specs/validation.md#validateapplykeymap
 */
export function validateApplyKeymap(
  document: VilDocument,
  definition: KeyboardDefinition,
  device: DeviceProfile,
  definitionBinding: DefinitionBinding,
  targets: readonly WriteTarget[],
): ApplyValidationResult {
  const diagnostics = collectDiagnostics(document, definition, device.capacities, device);
  const desired = deriveApplyValues(document, targets);
  const evidence = createValidationEvidence(
    diagnostics,
    device,
    definitionBinding,
    desired,
    targets,
  );
  return { diagnostics, summary: summarize(diagnostics), evidence };
}

function collectDiagnostics(
  document: VilDocument,
  definition: KeyboardDefinition,
  capacities: Capacities,
  device?: DeviceProfile,
): readonly Diagnostic[] {
  return [
    ...validateStructure(document),
    ...validateCompatibility(document, definition),
    ...validateReferences(document, definition, capacities),
    ...toReachabilityDiagnostics(document),
    ...(device === undefined ? [] : validateDeviceMatch(document, device)),
  ];
}

/** exported constructorは持たない。evidenceは`validateApplyKeymap`からしか生成できない。 */
function createValidationEvidence(
  diagnostics: readonly Diagnostic[],
  device: DeviceProfile,
  definition: DefinitionBinding,
  desired: ReadonlyMap<string, readonly number[]>,
  targets: readonly WriteTarget[],
): ValidationEvidence {
  const context: ApplyValidationContext = {
    keyboardUid: device.keyboardUid,
    definition: { ...definition },
    capacities: { ...device.capacities },
    supportedQsids: Object.freeze([...device.supportedQsids].sort((a, b) => a - b)),
  };
  const copiedDiagnostics = Object.freeze([...diagnostics]);
  const copiedDesired = copyValues(desired);
  const copiedTargets = Object.freeze(targets.map((target) => Object.freeze({ ...target })));
  const inputFingerprint = hashFingerprint(
    JSON.stringify([
      "validation-evidence-v2",
      context,
      serializeValues(copiedDesired),
      copiedTargets.map(targetKey),
      copiedDiagnostics.map((diagnostic) => [diagnostic.id, diagnostic.severity]),
    ]),
  );

  return {
    diagnostics: copiedDiagnostics,
    context,
    desired: copiedDesired,
    targets: copiedTargets,
    inputFingerprint,
    [VALIDATION_EVIDENCE]: true,
  };
}

function deriveApplyValues(
  document: VilDocument,
  targets: readonly WriteTarget[],
): ReadonlyMap<string, readonly number[]> {
  const desired = new Map<string, readonly number[]>();
  for (const target of targets) {
    const key = targetKey(target);
    if (desired.has(key)) throw new ApplyValueDerivationError(`Apply対象 ${key} が重複している`);
    switch (target.kind) {
      case "key": {
        const value = document.layout[target.layer]?.[target.row]?.[target.col];
        if (value === undefined || isAbsent(value)) {
          throw new ApplyValueDerivationError(`documentにApply対象 ${key} のkeycodeが無い`);
        }
        desired.set(key, [encodeVialKeycode(value, document.vialProtocol)]);
        break;
      }
      case "encoder": {
        const value = document.encoderLayout[target.layer]?.[target.index]?.[target.direction];
        if (value === undefined) {
          throw new ApplyValueDerivationError(`documentにApply対象 ${key} のkeycodeが無い`);
        }
        desired.set(key, [encodeVialKeycode(value, document.vialProtocol)]);
        break;
      }
      case "tapDance": {
        const value = document.tapDance[target.index];
        if (value === undefined)
          throw new ApplyValueDerivationError(`documentにApply対象 ${key} が無い`);
        desired.set(key, [
          ...value
            .slice(0, 4)
            .map((entry) => encodeVialKeycode(String(entry), document.vialProtocol)),
          value[4],
        ]);
        break;
      }
      case "combo": {
        const value = document.combo[target.index];
        if (value === undefined)
          throw new ApplyValueDerivationError(`documentにApply対象 ${key} が無い`);
        desired.set(
          key,
          value.map((entry) => encodeVialKeycode(entry, document.vialProtocol)),
        );
        break;
      }
      case "setting": {
        const value = document.settings[String(target.qsid)];
        if (value === undefined)
          throw new ApplyValueDerivationError(`documentにApply対象 ${key} が無い`);
        desired.set(key, [value]);
        break;
      }
    }
  }
  return desired;
}

export function isValidationEvidence(value: unknown): value is ValidationEvidence {
  return typeof value === "object" && value !== null && VALIDATION_EVIDENCE in value;
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

function serializeValues(values: ReadonlyMap<string, readonly number[]>): readonly unknown[] {
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, [...value]]);
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
