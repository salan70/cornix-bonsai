import { rotatePoint } from "../core/definition/parse.ts";
import type { PhysicalKey } from "../core/definition/types.ts";

/** 盤面の外接矩形。単位はKLEの`u`。 */
export interface BoardMetrics {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/** 描画倍率。`unit`は1uのpitch、`gap`はキー間の隙間（ともにpx）。 */
export interface BoardScale {
  readonly unit: number;
  readonly gap: number;
}

/** キー1つの描画box。単位はpx。`originX/originY`はキー自身のbox左上を基準とする。 */
export interface KeyBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly originX: number;
  readonly originY: number;
}

/**
 * 回転後の四隅を含む盤面の外接矩形。
 *
 * @doc docs/specs/ui.md#keymap-editor
 */
export function boardMetrics(keys: readonly PhysicalKey[]): BoardMetrics {
  if (keys.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const key of keys) {
    for (const [x, y] of corners(key)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * キーをCSSの絶対配置へ投影する。
 *
 * `transform-origin`は要素自身のbox基準で解決されるため、盤面座標の`rotationX/Y`から
 * キーの`x/y`を引いた相対値を返す。
 *
 * @doc docs/specs/ui.md#keymap-editor
 */
export function keyBox(key: PhysicalKey, metrics: BoardMetrics, scale: BoardScale): KeyBox {
  return {
    left: (key.x - metrics.minX) * scale.unit,
    top: (key.y - metrics.minY) * scale.unit,
    width: key.width * scale.unit - scale.gap,
    height: key.height * scale.unit - scale.gap,
    angle: key.rotationAngle,
    originX: (key.rotationX - key.x) * scale.unit,
    originY: (key.rotationY - key.y) * scale.unit,
  };
}

/** 盤面containerのpxサイズ。 */
export function boardSize(
  metrics: BoardMetrics,
  scale: BoardScale,
): { readonly width: number; readonly height: number } {
  return { width: metrics.width * scale.unit, height: metrics.height * scale.unit };
}

function corners(key: PhysicalKey): readonly (readonly [number, number])[] {
  const points: readonly (readonly [number, number])[] = [
    [key.x, key.y],
    [key.x + key.width, key.y],
    [key.x, key.y + key.height],
    [key.x + key.width, key.y + key.height],
  ];
  return points.map(([x, y]) => rotatePoint(x, y, key.rotationX, key.rotationY, key.rotationAngle));
}
