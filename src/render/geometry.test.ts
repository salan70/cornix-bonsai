import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { keyCenter, parseDefinition, toPhysicalLayout } from "../core/definition/parse.ts";
import type { PhysicalKey } from "../core/definition/types.ts";
import { boardMetrics, boardSize, keyBox } from "./geometry.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/cornix-lp");
const definition = parseDefinition(
  readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
);
const layout = toPhysicalLayout(definition);
const SCALE = { unit: 42, gap: 4 } as const;

test("回転キーの transform-origin はキー自身の box を基準にする", () => {
  const rotated = layout.keys.find((key) => key.rotationAngle !== 0);
  ok(rotated !== undefined, "回転キーが 1 つ以上ある");

  const metrics = boardMetrics(layout.keys);
  const box = keyBox(rotated, metrics, SCALE);

  strictEqual(box.originX, (rotated.rotationX - rotated.x) * SCALE.unit);
  strictEqual(box.originY, (rotated.rotationY - rotated.y) * SCALE.unit);
  // 盤面座標をそのまま渡すと origin が left/top の分ずれる（この回帰を止める）。
  ok(box.originX !== rotated.rotationX * SCALE.unit);
});

test("keyBox の回転後中心は keyCenter と一致する", () => {
  const metrics = boardMetrics(layout.keys);
  for (const key of layout.keys) {
    const box = keyBox(key, metrics, { unit: 1, gap: 0 });
    const rad = (box.angle * Math.PI) / 180;
    const dx = box.left + box.width / 2 - (box.left + box.originX);
    const dy = box.top + box.height / 2 - (box.top + box.originY);
    const cx = box.left + box.originX + dx * Math.cos(rad) - dy * Math.sin(rad);
    const cy = box.top + box.originY + dx * Math.sin(rad) + dy * Math.cos(rad);
    const [expectedX, expectedY] = keyCenter(key);

    ok(Math.abs(cx - (expectedX - metrics.minX)) < 1e-9, `${key.row},${key.col} の x`);
    ok(Math.abs(cy - (expectedY - metrics.minY)) < 1e-9, `${key.row},${key.col} の y`);
  }
});

test("盤面の外接矩形は回転キーの四隅を含む", () => {
  const metrics = boardMetrics(layout.keys);
  const size = boardSize(metrics, SCALE);

  for (const key of layout.keys) {
    const box = keyBox(key, metrics, SCALE);
    const rad = (box.angle * Math.PI) / 180;
    const cornerOffsets = [
      [0, 0],
      [box.width, 0],
      [0, box.height],
      [box.width, box.height],
    ] as const;
    for (const [ox, oy] of cornerOffsets) {
      const dx = ox - box.originX;
      const dy = oy - box.originY;
      const x = box.left + box.originX + dx * Math.cos(rad) - dy * Math.sin(rad);
      const y = box.top + box.originY + dx * Math.sin(rad) + dy * Math.cos(rad);
      ok(x >= -1e-6 && x <= size.width + 1e-6, `${key.row},${key.col} が横にはみ出す: ${x}`);
      ok(y >= -1e-6 && y <= size.height + 1e-6, `${key.row},${key.col} が縦にはみ出す: ${y}`);
    }
  }
});

test("gap は 1u でも 2u でも同じ幅になる", () => {
  const metrics = { minX: 0, minY: 0, width: 3, height: 1 };
  const base: PhysicalKey = {
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotationAngle: 0,
    rotationX: 0,
    rotationY: 0,
  };
  const single = keyBox(base, metrics, SCALE);
  const double = keyBox({ ...base, x: 1, width: 2 }, metrics, SCALE);

  strictEqual(single.width * 2 + SCALE.gap, double.width);
  strictEqual(single.left + single.width + SCALE.gap, double.left);
});

test("キーが無ければ盤面サイズは 0 になる", () => {
  strictEqual(boardSize(boardMetrics([]), SCALE).width, 0);
});
