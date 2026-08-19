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

/**
 * encoderの1方向を差し替える。
 *
 * `encoder_layout[layer][index][direction]`の形を保ったままrawを返す。存在しないencoder
 * へは書かず、keyの編集と同じくUI側の推測で配列を増やさない。
 */
/** @doc docs/specs/semantic-model.md#setencoderassignment */
export function setEncoderAssignment(
  document: VilDocument,
  position: EncoderPosition,
  keycode: string,
): VilDocument {
  const currentLayer = document.encoderLayout[position.layer];
  const currentEncoder = currentLayer?.[position.index];
  const current = currentEncoder?.[position.direction];
  if (currentLayer === undefined || currentEncoder === undefined || current === undefined) {
    throw new KeymapEditError(
      `(layer ${position.layer}, encoder ${position.index}, direction ${position.direction}) は範囲外`,
    );
  }

  const nextEncoder = [...currentEncoder];
  nextEncoder[position.direction] = keycode;
  const nextLayer = [...currentLayer];
  nextLayer[position.index] = nextEncoder;
  const encoderLayout = [...document.encoderLayout];
  encoderLayout[position.layer] = nextLayer;
  return { ...document, encoderLayout };
}

interface EncoderPosition {
  readonly layer: number;
  readonly index: number;
  readonly direction: 0 | 1;
}
