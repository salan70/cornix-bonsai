/**
 * `mac-keyboard.yaml` の検証。
 *
 * `validation/validate.ts` の `validateKeymap` は `VilDocument` と `KeyboardDefinition` を
 * 前提にするため使えない。合成の入口を Mac 側に別途置く（ADR 0022）。
 *
 * severity の判定規則は ADR 0010 のまま。Karabiner へ落とせないことは
 * **機能そのものが無くなる**ので error、書いたとおりには入るが効かないだけのものは
 * information にする。
 *
 */

import { analyzeLayerGraph } from "../validation/reachability.ts";
import {
  createDiagnostic,
  summarize,
  type Diagnostic,
  type DiagnosticSummary,
} from "../validation/types.ts";
import { classifyKeycode } from "../validation/keycode-vocabulary.ts";
import { generateKarabinerRules } from "./generate.ts";
import { KARABINER_POSITIONS } from "./key-codes.ts";
import type { MacKeymapDocument } from "./types.ts";

/** 検証の結果。 */
export interface MacValidationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: DiagnosticSummary;
}

/**
 * desired state を検証する。表現可能性・位置・到達性をまとめて見る。
 *
 * @doc docs/specs/mac-keymap.md#validatemackeymap
 */
export function validateMacKeymap(document: MacKeymapDocument): MacValidationResult {
  const diagnostics: Diagnostic[] = [
    ...unknownPositions(document),
    ...unknownLayers(document),
    // 表現可能性は生成器が判定する。落とせないものは manipulator を出さずに error を積む。
    ...generateKarabinerRules(document).diagnostics,
    ...unreachableLayers(document),
  ];
  return { diagnostics, summary: summarize(diagnostics) };
}

/** Karabiner の `key_code` として存在しない位置。lint を通らないので error。 */
function unknownPositions(document: MacKeymapDocument): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [layer, assignments] of [...document.layers.entries()].sort(([a], [b]) => a - b)) {
    for (const keyCode of [...assignments.keys()].sort()) {
      if (KARABINER_POSITIONS.has(keyCode)) continue;
      diagnostics.push(
        createDiagnostic(
          "mac-keymap/unknown-position",
          "error",
          { kind: "macKey", layer, keyCode },
          `${keyCode} は Karabiner の key_code に無い`,
          { keyCode },
        ),
      );
    }
  }
  return diagnostics;
}

/** 書かれていない layer を指す `MO` / `LT` / `TG`。変数は立つが読む manipulator が無い。 */
function unknownLayers(document: MacKeymapDocument): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [layer, assignments] of [...document.layers.entries()].sort(([a], [b]) => a - b)) {
    for (const keyCode of [...assignments.keys()].sort()) {
      const keycode = assignments.get(keyCode);
      if (keycode === undefined) continue;
      const lexeme = classifyKeycode(keycode);
      if (lexeme.kind !== "layerSwitch" || document.layers.has(lexeme.layer)) continue;
      diagnostics.push(
        createDiagnostic(
          "mac-keymap/unknown-layer",
          "warning",
          { kind: "macKey", layer, keyCode },
          `${keycode} が指す layer ${lexeme.layer} は書かれていない`,
          { keyCode, keycode, target: lexeme.layer },
        ),
      );
    }
  }
  return diagnostics;
}

/**
 * layer 0 から辿り着けない layer。
 *
 * severity は Vial 側の `reachability/unreachable-layer` と揃えて information にする。
 * 書けば書いたとおりに rule へ入り、失われる値も無い（ADR 0010）。
 *
 * Vial 側の `trapped-layer` はここでは見ない。Karabiner では layer 0 の manipulator が
 * 変数の状態に関わらず常に効くため、`TG(n)` を置いたキーが上の layer で潰されていない限り
 * 出口は必ずある。
 */
function unreachableLayers(document: MacKeymapDocument): readonly Diagnostic[] {
  const graph = analyzeLayerGraph(
    new Map(
      [...document.layers.entries()].map(([layer, assignments]) => [
        layer,
        [...assignments.values()],
      ]),
    ),
  );
  const empty = new Set(graph.emptyLayers);
  const diagnostics: Diagnostic[] = [];
  for (const layer of [...document.layers.keys()].sort((a, b) => a - b)) {
    if (layer === 0 || graph.reachable.has(layer) || empty.has(layer)) continue;
    diagnostics.push(
      createDiagnostic(
        "mac-keymap/unreachable-layer",
        "information",
        { kind: "layer", layer },
        `layer ${layer} に割り当てがあるが、layer 0 から辿り着く keycode が無い`,
        { layer },
      ),
    );
  }
  return diagnostics;
}
