/**
 * keyboard definition の読み込みと KLE 展開。
 *
 * 展開規則は vial-gui の `kle_serial.py` が正（ADR 0002）。分類は `keyboard_comm.py` の
 * `reload_layout` に合わせる。
 *
 */

import type { KeyboardDefinition, PhysicalEncoder, PhysicalKey, PhysicalLayout } from "./types.ts";

/** definition が期待した形をしていないときに投げる。 */
export class DefinitionParseError extends Error {}

/** vial-gui `kle_serial.py` の `labelMap`。align 値ごとの label 並べ替え表。 */
const LABEL_MAP: readonly (readonly number[])[] = [
  [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
  [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
  [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
  [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
  [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
  [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
  [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
  [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1],
];

interface KleKey {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationAngle: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly decal: boolean;
  readonly labels: readonly (string | null)[];
}

/** definition の JSON テキストを読み込む。 */
export function parseDefinition(text: string): KeyboardDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new DefinitionParseError(`definition を JSON として読めなかった: ${String(cause)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DefinitionParseError("definition の top-level は object でなければならない");
  }

  const source = parsed as Record<string, unknown>;
  const layouts = source["layouts"];
  if (layouts === null || typeof layouts !== "object" || Array.isArray(layouts)) {
    throw new DefinitionParseError('definition の "layouts" は object でなければならない');
  }
  const keymap = (layouts as Record<string, unknown>)["keymap"];
  if (!Array.isArray(keymap)) {
    throw new DefinitionParseError('definition の "layouts.keymap" は array でなければならない');
  }
  const matrix = source["matrix"];
  if (matrix === null || typeof matrix !== "object" || Array.isArray(matrix)) {
    throw new DefinitionParseError('definition の "matrix" は object でなければならない');
  }

  return parsed as KeyboardDefinition;
}

/**
 * KLE を展開して物理配列を得る。
 *
 * KLE の `x` / `y` は回転前の左上座標。回転キーの実際の位置を出すには
 * `(rotationX, rotationY)` を中心に `rotationAngle` 度回す必要がある（`keyCenter` を使う）。
 *
 * @doc docs/specs/semantic-model.md#tophysicallayout
 */
export function toPhysicalLayout(definition: KeyboardDefinition): PhysicalLayout {
  const keys: PhysicalKey[] = [];
  const encoders: PhysicalEncoder[] = [];

  for (const key of deserializeKle(definition.layouts.keymap)) {
    const primary = key.labels[0];
    const layoutOption = parseLayoutOption(key.labels[8]);

    if (key.labels[4] === "e") {
      // encoder。label[0] は "index,direction"。
      const [index, direction] = parsePair(primary);
      if (index === undefined || direction === undefined) continue;
      encoders.push({ index, direction, x: key.x, y: key.y });
      continue;
    }

    if (!key.decal && (primary == null || !primary.includes(","))) continue;
    const [row, col] = parsePair(primary);
    if (row === undefined || col === undefined) continue;

    keys.push({
      row,
      col,
      x: key.x,
      y: key.y,
      width: key.width,
      height: key.height,
      rotationAngle: key.rotationAngle,
      rotationX: key.rotationX,
      rotationY: key.rotationY,
      ...(layoutOption === undefined ? {} : { layoutOption }),
    });
  }

  return { keys, encoders };
}

/** 回転を適用した後のキー中心座標。 */
export function keyCenter(key: PhysicalKey): readonly [number, number] {
  const cx = key.x + key.width / 2;
  const cy = key.y + key.height / 2;
  if (key.rotationAngle === 0) return [cx, cy];

  const rad = (key.rotationAngle * Math.PI) / 180;
  const dx = cx - key.rotationX;
  const dy = cy - key.rotationY;
  return [
    key.rotationX + dx * Math.cos(rad) - dy * Math.sin(rad),
    key.rotationY + dx * Math.sin(rad) + dy * Math.cos(rad),
  ];
}

/** `kle_serial.py` の `deserialize` から、幾何と label に効く部分だけを移した実装。 */
function deserializeKle(rows: readonly unknown[]): readonly KleKey[] {
  let x = 0;
  let y = 0;
  let width = 1;
  let height = 1;
  let rotationAngle = 0;
  let rotationX = 0;
  let rotationY = 0;
  let decal = false;
  let clusterX = 0;
  let clusterY = 0;
  let align = 4;

  const keys: KleKey[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const item of row) {
      if (typeof item === "string") {
        keys.push({
          x,
          y,
          width,
          height,
          rotationAngle,
          rotationX,
          rotationY,
          decal,
          labels: reorderLabels(item.split("\n"), align),
        });
        x += width;
        width = 1;
        height = 1;
        decal = false;
        continue;
      }
      if (item === null || typeof item !== "object") continue;

      const props = item as Record<string, unknown>;
      if (typeof props["r"] === "number") rotationAngle = props["r"];
      if (typeof props["rx"] === "number") {
        rotationX = clusterX = props["rx"];
        x = clusterX;
        y = clusterY;
      }
      if (typeof props["ry"] === "number") {
        rotationY = clusterY = props["ry"];
        x = clusterX;
        y = clusterY;
      }
      if (typeof props["a"] === "number") align = props["a"];
      if (typeof props["x"] === "number") x += props["x"];
      if (typeof props["y"] === "number") y += props["y"];
      if (typeof props["w"] === "number") width = props["w"];
      if (typeof props["h"] === "number") height = props["h"];
      if (typeof props["d"] === "boolean") decal = props["d"];
    }
    y += 1;
    x = rotationX;
  }

  return keys;
}

function reorderLabels(labels: readonly string[], align: number): readonly (string | null)[] {
  const result: (string | null)[] = Array.from({ length: 12 }, () => null);
  const map = LABEL_MAP[align];
  if (map === undefined) return result;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const target = map[i];
    if (label === undefined || label === "" || target === undefined || target < 0) continue;
    result[target] = label;
  }
  return result;
}

/** `"3,2"` のような label を数値の組へ。 */
function parsePair(label: string | null | undefined): readonly [number?, number?] {
  if (label === null || label === undefined) return [];
  const parts = label.split(",").map(Number);
  const first = parts[0];
  const second = parts[1];
  if (
    first === undefined ||
    second === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return [];
  }
  return [first, second];
}

/** label[8] の layout option 指定。`-1` は「選択肢に属さない」を意味する。 */
function parseLayoutOption(
  label: string | null | undefined,
): readonly [number, number] | undefined {
  const [option, choice] = parsePair(label);
  if (option === undefined || choice === undefined || option < 0) return undefined;
  return [option, choice];
}
