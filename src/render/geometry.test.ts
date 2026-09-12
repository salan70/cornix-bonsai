import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { keyCenter, parseDefinition, toPhysicalLayout } from "../core/definition/parse.ts";
import type { PhysicalKey } from "../core/definition/types.ts";
import type { KeyShape } from "./geometry.ts";
import { boardMetrics, boardSize, fitUnit, keyBox } from "./geometry.ts";

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

test("fitUnit は幅と高さの厳しい方に合わせる", () => {
  const metrics = { minX: 0, minY: 0, width: 10, height: 5 };
  const range = { min: 14, max: 52 };

  strictEqual(fitUnit(metrics, { width: 300, height: 300 }, range), 30);
  strictEqual(fitUnit(metrics, { width: 300, height: 100 }, range), 20);
  // height を渡さなければ幅だけで決まる。
  strictEqual(fitUnit(metrics, { width: 300 }, range), 30);
});

test("fitUnit は range で頭打ちにする", () => {
  const metrics = { minX: 0, minY: 0, width: 10, height: 5 };
  const range = { min: 14, max: 52 };

  strictEqual(fitUnit(metrics, { width: 2000, height: 2000 }, range), 52);
  strictEqual(fitUnit(metrics, { width: 50, height: 50 }, range), 14);
});

test("fitUnit は未実測なら max を返す", () => {
  const metrics = { minX: 0, minY: 0, width: 10, height: 5 };
  const range = { min: 14, max: 52 };

  strictEqual(fitUnit(metrics, { width: 0, height: 0 }, range), 52);
  // 高さだけ未実測なら幅で決める。
  strictEqual(fitUnit(metrics, { width: 300, height: 0 }, range), 30);
  strictEqual(fitUnit(boardMetrics([]), { width: 300, height: 300 }, range), 52);
});

test("fitUnit の倍率なら盤面は available に収まる", () => {
  const metrics = boardMetrics(layout.keys);
  const range = { min: 14, max: 52 };
  for (const available of [
    { width: 298, height: 200 },
    { width: 634, height: 240 },
    { width: 634, height: 120 },
    { width: 1200, height: 900 },
  ]) {
    const unit = fitUnit(metrics, available, range);
    if (unit === range.min || unit === range.max) continue;
    const size = boardSize(metrics, { unit, gap: 0 });
    ok(size.width <= available.width, `幅がはみ出す: ${size.width} > ${available.width}`);
    ok(size.height <= available.height, `高さがはみ出す: ${size.height} > ${available.height}`);
  }
});

test("matrix を持たない KeyShape だけでも盤面を組める", () => {
  // Mac 盤面（row/col が無い）が構造的部分型として通ることを固定する。
  const wide: KeyShape = {
    x: 1,
    y: 0,
    width: 1.5,
    height: 1,
    rotationAngle: 0,
    rotationX: 0,
    rotationY: 0,
  };
  const keys: readonly KeyShape[] = [
    { x: 0, y: 0, width: 1, height: 1, rotationAngle: 0, rotationX: 0, rotationY: 0 },
    wide,
  ];
  const metrics = boardMetrics(keys);
  strictEqual(metrics.width, 2.5);
  strictEqual(metrics.height, 1);

  const box = keyBox(wide, metrics, SCALE);
  strictEqual(box.left, SCALE.unit);
  strictEqual(box.width, 1.5 * SCALE.unit - SCALE.gap);
});
