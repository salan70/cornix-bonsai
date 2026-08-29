/** 2列へ落とすgrid幅の境界（px）。 */
const NARROW_GRID_WIDTH = 760;

/** 列数の上限。これ以上増やすとcard 1枚が小さくなり、layerの読み取りが落ちる。 */
const MAX_COLUMNS = 3;

/**
 * layer cardのgridの列数。
 *
 * 上限まで詰めるのではなく、行あたりのcard数が揃う列数まで減らす。4 layerを3+1で並べると
 * 右端の1セル分の幅を捨てるため、2×2にしてcardを広く取る。
 *
 * @doc docs/specs/ui.md#overview-layer-grid
 */
export function overviewColumns(layerCount: number, gridWidth: number): number {
  if (layerCount <= 1) return 1;
  const maxColumns = gridWidth > 0 && gridWidth < NARROW_GRID_WIDTH ? 2 : MAX_COLUMNS;
  const rows = Math.ceil(layerCount / maxColumns);
  return Math.max(1, Math.ceil(layerCount / rows));
}
