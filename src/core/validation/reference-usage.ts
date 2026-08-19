import { isAbsent, type VilDocument } from "../vil/types.ts";
import { classifyKeycode } from "./keycode-vocabulary.ts";

/** @doc docs/specs/validation.md#referenceusagesummary */
export interface ReferenceUsageSummary {
  /** TD(index)を参照した回数。 */
  readonly tapDance: ReadonlyMap<number, number>;
  /** M(index)を参照した回数。 */
  readonly macro: ReadonlyMap<number, number>;
}

/**
 * document内のdynamic entry参照を数える。
 *
 * validationの可否判定とは分離し、UIのusages / unused表示だけに使う。wrapper内のkeycodeも
 * 見るが、未知・数値表記は意味を推測せず数えない。
 *
 * @doc docs/specs/validation.md#collectreferenceusage
 */
export function collectReferenceUsage(document: VilDocument): ReferenceUsageSummary {
  const tapDance = new Map<number, number>();
  const macro = new Map<number, number>();

  const visit = (keycode: string): void => {
    const lexeme = classifyKeycode(keycode);
    switch (lexeme.kind) {
      case "tapDance":
        tapDance.set(lexeme.index, (tapDance.get(lexeme.index) ?? 0) + 1);
        return;
      case "macro":
        macro.set(lexeme.index, (macro.get(lexeme.index) ?? 0) + 1);
        return;
      case "layerSwitch":
      case "modified":
      case "modTap":
        if (lexeme.inner !== undefined) visit(lexeme.inner);
        return;
      default:
        return;
    }
  };

  for (const layer of document.layout)
    for (const row of layer) for (const entry of row) if (!isAbsent(entry)) visit(entry);
  for (const layer of document.encoderLayout)
    for (const encoder of layer) for (const keycode of encoder) visit(keycode);
  for (const entry of document.tapDance)
    for (const keycode of entry.slice(0, 4)) if (typeof keycode === "string") visit(keycode);
  for (const entry of document.combo) for (const keycode of entry) visit(keycode);

  return { tapDance, macro };
}
