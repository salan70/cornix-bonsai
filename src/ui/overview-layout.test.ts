import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { overviewColumns } from "./overview-layout.ts";

const WIDE = 1200;
const NARROW = 700;

test("行あたりのcard数が揃う列数まで減らす", () => {
  strictEqual(overviewColumns(1, WIDE), 1);
  strictEqual(overviewColumns(2, WIDE), 2);
  strictEqual(overviewColumns(3, WIDE), 3);
  // 3+1 で右端を空けるより 2×2 の方がcardを広く取れる。
  strictEqual(overviewColumns(4, WIDE), 2);
  strictEqual(overviewColumns(5, WIDE), 3);
  strictEqual(overviewColumns(6, WIDE), 3);
  strictEqual(overviewColumns(7, WIDE), 3);
  strictEqual(overviewColumns(8, WIDE), 3);
  strictEqual(overviewColumns(10, WIDE), 3);
});

test("狭いgridでは2列を上限にする", () => {
  strictEqual(overviewColumns(3, NARROW), 2);
  strictEqual(overviewColumns(5, NARROW), 2);
  strictEqual(overviewColumns(1, NARROW), 1);
});

test("行数はどの列数でも最小のまま", () => {
  for (let layerCount = 1; layerCount <= 16; layerCount += 1) {
    const columns = overviewColumns(layerCount, WIDE);
    strictEqual(Math.ceil(layerCount / columns), Math.ceil(layerCount / 3));
  }
});

test("gridが未実測なら3列を上限にする", () => {
  strictEqual(overviewColumns(5, 0), 3);
});
