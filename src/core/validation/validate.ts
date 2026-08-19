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
import { toReachabilityDiagnostics } from "./reachability.ts";
import { validateReferences } from "./references.ts";
import { validateStructure } from "./structure.ts";
import { summarize, type Diagnostic, type DiagnosticSummary } from "./types.ts";

/** validation の結果。 */
export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: DiagnosticSummary;
}

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

  const diagnostics: Diagnostic[] = [
    ...validateStructure(document),
    ...validateCompatibility(document, definition),
    ...validateReferences(document, definition, capacities),
    ...toReachabilityDiagnostics(document),
    ...(device === undefined ? [] : validateDeviceMatch(document, device)),
  ];

  return { diagnostics, summary: summarize(diagnostics) };
}
