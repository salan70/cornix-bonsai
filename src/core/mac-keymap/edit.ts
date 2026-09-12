/**
 * `MacKeymapDocument` の意味単位の編集操作。
 *
 * Semantic Core は React、filesystem、WebHID の詳細から独立させる（AGENTS.md）。
 *
 * `src/core/model/edit.ts` と同じ思想で、keycode は正規化せず渡された表記のまま置き、
 * 妥当性の判定は `validateMacKeymap` に委ねる（ADR 0025）。Vial 側と違い layers は
 * 疎な map なので「範囲外」という概念が無く、無い layer への書き込みは layer を作る。
 */

import type { MacKeymapDocument, MacLayerAssignments } from "./types.ts";

/** 編集操作の入力が成立しないときに投げる。 */
export class MacKeymapEditError extends Error {}

function withLayer(
  document: MacKeymapDocument,
  layer: number,
  assignments: MacLayerAssignments,
): MacKeymapDocument {
  const layers = new Map(document.layers);
  layers.set(layer, assignments);
  return { ...document, layers };
}

function requireValidLayer(layer: number): void {
  if (!Number.isInteger(layer) || layer < 0) {
    throw new MacKeymapEditError(`layer は 0 以上の整数（${layer} が渡された）`);
  }
}

/**
 * `(layer, keyCode)` の割り当てを差し替える。layer が無ければ作る。
 *
 * 空文字は serialize / parse の前提を壊すため拒む。それ以外の表記の妥当性は
 * `validateMacKeymap` の責務。
 *
 * @doc docs/specs/mac-keymap.md#mac-edit
 */
export function setMacAssignment(
  document: MacKeymapDocument,
  layer: number,
  keyCode: string,
  keycode: string,
): MacKeymapDocument {
  requireValidLayer(layer);
  if (keyCode === "") throw new MacKeymapEditError("keyCode が空");
  if (keycode === "") throw new MacKeymapEditError("keycode が空");

  const assignments = new Map(document.layers.get(layer) ?? []);
  assignments.set(keyCode, keycode);
  return withLayer(document, layer, assignments);
}

/**
 * `(layer, keyCode)` の割り当てを外し、素通しへ戻す。
 *
 * `KC_NO`（イベントを捨てる）と削除（素通し）は別セマンティクスなので、削除は
 * この関数でしか表せない（ADR 0022 の疎な map）。空になった layer は残す。
 * 「割り当てを外したら layer が消える」という驚きを避けるためで、layer の削除は
 * 独立した操作にする。
 *
 * @doc docs/specs/mac-keymap.md#mac-edit
 */
export function clearMacAssignment(
  document: MacKeymapDocument,
  layer: number,
  keyCode: string,
): MacKeymapDocument {
  const current = document.layers.get(layer);
  if (current === undefined || !current.has(keyCode)) return document;

  const assignments = new Map(current);
  assignments.delete(keyCode);
  return withLayer(document, layer, assignments);
}

/**
 * 空の layer を追加する。既にあれば何もしない。
 *
 * @doc docs/specs/mac-keymap.md#mac-edit
 */
export function addMacLayer(document: MacKeymapDocument, layer: number): MacKeymapDocument {
  requireValidLayer(layer);
  if (document.layers.has(layer)) return document;
  return withLayer(document, layer, new Map());
}
