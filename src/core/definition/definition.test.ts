import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseVil } from "../vil/parse.ts";
import { isAbsent } from "../vil/types.ts";
import { keyCenter, parseDefinition, toPhysicalLayout } from "./parse.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const definition = parseDefinition(readFixture("vial-definition-v1.12.json"));
const baseline = parseVil(readFixture("baseline.vil").trimEnd());

test("KLE 展開で物理キーと encoder が得られる", () => {
  const layout = toPhysicalLayout(definition);

  strictEqual(layout.keys.length, 50);
  strictEqual(new Set(layout.encoders.map((e) => e.index)).size, 2);
  strictEqual(layout.encoders.length, 4); // encoder 2 個 × 2 方向
  strictEqual(definition.matrix.rows, 8);
  strictEqual(definition.matrix.cols, 7);
});

test("definition の (row,col) 集合が baseline.vil の非 -1 位置と完全一致する", () => {
  // これが「代表的な .vil と definition の組を表現できる」ことの中核。
  const fromDefinition = new Set(
    toPhysicalLayout(definition).keys.map((key) => `${key.row},${key.col}`),
  );

  const fromVil = new Set<string>();
  baseline.layout[0]?.forEach((row, rowIndex) => {
    row.forEach((entry, colIndex) => {
      if (!isAbsent(entry)) fromVil.add(`${rowIndex},${colIndex}`);
    });
  });

  deepStrictEqual([...fromDefinition].sort(), [...fromVil].sort());
});

test("baseline.vil の layout 形状が matrix 宣言と一致する", () => {
  ok(
    baseline.layout.every(
      (layer) =>
        layer.length === definition.matrix.rows &&
        layer.every((row) => row.length === definition.matrix.cols),
    ),
  );
});

test("encoder 数が .vil と一致する", () => {
  const encoderCount = new Set(toPhysicalLayout(definition).encoders.map((e) => e.index)).size;
  strictEqual(encoderCount, baseline.encoderLayout[0]?.length);
});

test("回転キーの中心は回転を適用した座標になる", () => {
  const rotated = toPhysicalLayout(definition).keys.find((key) => key.rotationAngle !== 0);
  ok(rotated !== undefined, "回転キーが 1 つ以上ある");

  const [cx, cy] = keyCenter(rotated);
  const rawCx = rotated.x + rotated.width / 2;
  const rawCy = rotated.y + rotated.height / 2;
  ok(cx !== rawCx || cy !== rawCy, "回転前の中心とは異なる");
});

test("物理配列は .vil を参照せずに導出できる", () => {
  // toPhysicalLayout の引数は definition だけ。依存方向がそのまま型に出ている。
  const layout = toPhysicalLayout(definition);
  ok(layout.keys.length > 0);
});
