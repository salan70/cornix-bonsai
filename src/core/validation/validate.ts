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
import type { Capacities } from "../keycode/table.ts";
import { observeCapacities } from "../model/keymap-view.ts";
import type { VilDocument } from "../vil/types.ts";
import { validateCompatibility, validateDeviceMatch, type DeviceProfile } from "./compatibility.ts";
import {
  createValidationEvidence,
  type ApplyValidationIdentity,
  type ValidationEvidence,
} from "./evidence.ts";
import { toReachabilityDiagnostics } from "./reachability.ts";
import { validateReferences } from "./references.ts";
import { validateStructure } from "./structure.ts";
import { summarize, type Diagnostic, type DiagnosticSummary } from "./types.ts";

/** validation の結果。 */
export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: DiagnosticSummary;
  /** Apply対象identityを指定した場合だけ生成されるbranded evidence。 */
  readonly evidence?: ValidationEvidence;
}

/**
 * keymap を検証する。`device` を渡すと実機との組み合わせ検証まで行う。
 *
 * `device` を渡した場合、容量は**実機の申告値**を使う。渡さない場合だけ `.vil` から
 * 観測した値で代用する（ADR 0003）。この分岐をここ 1 か所に閉じることで、
 * call site が誤って `.vil` 由来の容量を実機の容量として渡す経路を消している。
 * `applyIdentity`を渡すと、validation対象とdesired fingerprintを束ねたevidenceを返す。
 * Applyへ進む場合はこのevidenceからgateを作る。
 *
 * @doc docs/specs/validation.md#validatekeymap
 */
export function validateKeymap(
  document: VilDocument,
  definition: KeyboardDefinition,
  device?: DeviceProfile,
  applyIdentity?: ApplyValidationIdentity,
): ValidationResult {
  if (applyIdentity !== undefined && device === undefined) {
    throw new Error("Apply用validation evidenceには実機のDeviceProfileが必要");
  }
  const capacities: Capacities = device?.capacities ?? observeCapacities(document);

  const diagnostics: Diagnostic[] = [
    ...validateStructure(document),
    ...validateCompatibility(document, definition),
    ...validateReferences(document, definition, capacities),
    ...toReachabilityDiagnostics(document),
    ...(device === undefined ? [] : validateDeviceMatch(document, device)),
  ];

  const evidence =
    applyIdentity === undefined || device === undefined
      ? undefined
      : createValidationEvidence(
          diagnostics,
          {
            keyboardUid: device.keyboardUid,
            definition: applyIdentity.definition,
            capacities: device.capacities,
            supportedQsids: device.supportedQsids,
          },
          applyIdentity.desiredFingerprint,
        );

  return evidence === undefined
    ? { diagnostics, summary: summarize(diagnostics) }
    : { diagnostics, summary: summarize(diagnostics), evidence };
}
