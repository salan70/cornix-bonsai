/**
 * Semantic View。UI・CLI・analysis・rendering・Vial adapter が共有する意味表現。
 *
 * ADR 0001 が「raw を保持し、意味表現は**派生ビュー**として持つ」と決めているため、
 * 状態は `VilDocument` ただ 1 つとし、ここはそこから毎回導出する読み取り専用の値にする。
 * View を保存も比較の正ともしない。編集は `edit.ts` が raw を返す純関数で行う。
 *
 * 層の切り分け（D-001）:
 *   - raw（`VilDocument`）    : `.vil` の逐語保持。唯一の状態
 *   - semantic（`KeymapView`）: ここ。definition と組にして初めて意味が決まる派生値
 *   - device（u16 の wire 値） : 実機 read / write の比較単位（ADR 0003、未実装）
 *   - 派生（`PhysicalLayout`）: definition 由来の物理配列。rendering 専用で round-trip 対象外
 *
 * この module は React・filesystem・WebHID のいずれにも依存しない（AGENTS.md 設計ルール）。
 *
 */

import { toPhysicalLayout } from "../definition/parse.ts";
import type { KeyboardDefinition, PhysicalKey } from "../definition/types.ts";
import { createKeycodeTable, type Capacities, type ResolvedKeycode } from "../keycode/table.ts";
import { isAbsent, type VilDocument } from "../vil/types.ts";
import { resolveLayoutOptions, type LayoutOptions } from "./layout-options.ts";

/** matrix 上の位置。 */
export interface KeyPosition {
  readonly layer: number;
  readonly row: number;
  readonly col: number;
}

/** layer 上の物理キー 1 個の割り当て。 */
export interface KeyView {
  readonly position: KeyPosition;
  readonly physical: PhysicalKey;
  /** 入力表記のまま。正規化しない（ADR 0001）。 */
  readonly keycode: string;
  readonly resolved: ResolvedKeycode;
}

/** encoder の 1 方向。direction 0 = 反時計回り（ADR 0003）。 */
export interface EncoderView {
  readonly layer: number;
  readonly index: number;
  readonly direction: "ccw" | "cw";
  readonly keycode: string;
  readonly resolved: ResolvedKeycode;
}

/** raw と definition から導いた意味表現。 */
export interface KeymapView {
  readonly keyboardUid: string;
  /**
   * `.vil` から観測した容量。**実機 Apply では実機の申告値で置き換える**（ADR 0003）。
   * `.vil` 由来の値を実機の容量として使ってはいけない。
   */
  readonly capacities: Capacities;
  readonly keys: readonly KeyView[];
  readonly encoders: readonly EncoderView[];
  readonly layoutOptions: LayoutOptions;
  /**
   * `.vil` には値があるが definition の物理配列に無い位置。
   * definition のバージョン違いを黙って落とさないために明示する。
   */
  readonly orphanPositions: readonly KeyPosition[];
}

/** `.vil` から容量を観測する。実機 Apply では使わない（ADR 0003）。 */
export function observeCapacities(document: VilDocument): Capacities {
  return {
    layerCount: document.layout.length,
    macroCount: document.macro.length,
    tapDanceCount: document.tapDance.length,
    comboCount: document.combo.length,
  };
}

/** `(layer, row, col)` の keycode を読む。`-1`（物理キー無し）と範囲外は `undefined`。 */
export function readKeycode(document: VilDocument, position: KeyPosition): string | undefined {
  const entry = document.layout[position.layer]?.[position.row]?.[position.col];
  if (entry === undefined || isAbsent(entry)) return undefined;
  return entry;
}

/**
 * raw と definition から Semantic View を導出する。
 *
 * 走査の起点は**definition 由来の物理配列**であって `.vil` の全マスではない。
 * `.vil` にあって definition に無い位置は捨てず `orphanPositions` へ集める。
 *
 * @doc docs/specs/semantic-model.md#buildkeymapview
 */
export function buildKeymapView(document: VilDocument, definition: KeyboardDefinition): KeymapView {
  const physical = toPhysicalLayout(definition);
  const capacities = observeCapacities(document);
  const table = createKeycodeTable(definition, capacities);

  const keys: KeyView[] = [];
  const covered = new Set<string>();
  for (let layer = 0; layer < capacities.layerCount; layer++) {
    for (const key of physical.keys) {
      const position = { layer, row: key.row, col: key.col };
      covered.add(`${key.row},${key.col}`);
      const keycode = readKeycode(document, position);
      if (keycode === undefined) continue;
      keys.push({ position, physical: key, keycode, resolved: table.resolve(keycode) });
    }
  }

  const orphanPositions: KeyPosition[] = [];
  document.layout.forEach((layer, layerIndex) => {
    layer.forEach((row, rowIndex) => {
      row.forEach((entry, colIndex) => {
        if (isAbsent(entry)) return;
        if (covered.has(`${rowIndex},${colIndex}`)) return;
        orphanPositions.push({ layer: layerIndex, row: rowIndex, col: colIndex });
      });
    });
  });

  const encoders: EncoderView[] = [];
  document.encoderLayout.forEach((layer, layerIndex) => {
    layer.forEach((encoder, encoderIndex) => {
      encoder.forEach((keycode, direction) => {
        encoders.push({
          layer: layerIndex,
          index: encoderIndex,
          direction: direction === 0 ? "ccw" : "cw",
          keycode,
          resolved: table.resolve(keycode),
        });
      });
    });
  });

  return {
    keyboardUid: document.uid,
    capacities,
    keys,
    encoders,
    layoutOptions: resolveLayoutOptions(document.layoutOptions, definition, physical),
    orphanPositions,
  };
}
