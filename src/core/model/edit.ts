/**
 * 意味単位の編集操作。
 *
 * 「raw が唯一の状態」（ADR 0001）という決定は、**書き戻しが成立して初めて証明される**。
 * ここは意味単位の位置指定を受け取り、raw の対応位置だけを差し替えた新しい
 * `VilDocument` を返す純関数の置き場。View を経由しないので状態の二重化が起きない。
 *
 */

import { isAbsent, type VilDocument, type VilKeyEntry } from "../vil/types.ts";
import type { KeyPosition } from "./keymap-view.ts";

/** 編集対象の位置が不正なときに投げる。 */
export class KeymapEditError extends Error {}

/**
 * `(layer, row, col)` の keycode を差し替える。
 *
 * 物理キーが存在しない位置（`-1`）へは書かない。`-1` は「キーが無い」であり、
 * 「割り当てが空」の `KC_NO` とは別物なので、混同すると definition と矛盾する
 * `.vil` を作ってしまう。
 *
 * keycode は正規化せず、渡された表記のまま置く（ADR 0001）。
 *
 * @doc docs/specs/semantic-model.md#setkeyassignment
 */
export function setKeyAssignment(
  document: VilDocument,
  position: KeyPosition,
  keycode: string,
): VilDocument {
  const { layer, row, col } = position;
  const currentLayer = document.layout[layer];
  const currentRow = currentLayer?.[row];
  const current = currentRow?.[col];

  if (currentLayer === undefined || currentRow === undefined || current === undefined) {
    throw new KeymapEditError(`(layer ${layer}, row ${row}, col ${col}) は layout の範囲外`);
  }
  if (isAbsent(current)) {
    throw new KeymapEditError(
      `(layer ${layer}, row ${row}, col ${col}) には物理キーが無い（-1）ため書き換えられない`,
    );
  }

  const nextRow: VilKeyEntry[] = [...currentRow];
  nextRow[col] = keycode;
  const nextLayer = [...currentLayer];
  nextLayer[row] = nextRow;
  const layout = [...document.layout];
  layout[layer] = nextLayer;

  return { ...document, layout };
}
