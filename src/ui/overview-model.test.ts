import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseVil } from "../core/vil/parse.ts";
import type { VilDocument } from "../core/vil/types.ts";
import { buildOverviewModel } from "./overview-model.ts";

test("baselineはlayer 0〜4を参照あり、5〜9を参照なしとして導出する", () => {
  const document = parseVil(readFileSync("fixtures/cornix-lp/baseline.vil", "utf8"));
  const model = buildOverviewModel(document);

  deepStrictEqual(model.visibleLayers, [0, 1, 2, 3, 4]);
  deepStrictEqual(model.hiddenLayers, [5, 6, 7, 8, 9]);
  deepStrictEqual(
    model.tapDances.map(({ index, usageCount }) => [index, usageCount]),
    [[1, 1]],
  );
  strictEqual(model.tapDances[0]?.entry[0], "HYPR(KC_SPACE)");
});

test("physical key・encoder・TapDance・Comboのlayer操作とwrapperを参照として集計する", () => {
  const document: VilDocument = {
    version: 1,
    uid: "1",
    layout: [[["LSFT(MO(2))"]], [["KC_NO"]], [["KC_NO"]], [["KC_NO"]]],
    encoderLayout: [[["MO(3)", "KC_A"]], [], [], []],
    layoutOptions: 0,
    macro: [],
    vialProtocol: 6,
    viaProtocol: 9,
    tapDance: [["TO(1)", "KC_NO", "KC_NO", "KC_NO", 200]],
    combo: [["KC_A", "KC_A", "KC_NO", "KC_NO", "TG(2)"]],
    keyOverride: [],
    altRepeatKey: [],
    settings: {},
    raw: { keyOrder: [], unknown: {} },
  };
  const model = buildOverviewModel(document);

  deepStrictEqual(model.visibleLayers, [0, 1, 2, 3]);
  deepStrictEqual(
    model.references.map(({ source, targetLayer }) => [source.kind, source.id, targetLayer]),
    [
      ["key", "key:0:0:0", 2],
      ["encoder", "encoder:0:0:0", 3],
      ["tapDance", "tapDance:0:0", 1],
      ["combo", "combo:0:4", 2],
    ],
  );
});

test("範囲外のlayer操作は表示対象へ追加しない", () => {
  const document: VilDocument = {
    version: 1,
    uid: "1",
    layout: [[["MO(9)"]], [["KC_NO"]]],
    encoderLayout: [[], []],
    layoutOptions: 0,
    macro: [],
    vialProtocol: 6,
    viaProtocol: 9,
    tapDance: [],
    combo: [],
    keyOverride: [],
    altRepeatKey: [],
    settings: {},
    raw: { keyOrder: [], unknown: {} },
  };

  const model = buildOverviewModel(document);
  deepStrictEqual(model.visibleLayers, [0]);
  deepStrictEqual(model.hiddenLayers, [1]);
  strictEqual(model.references[0]?.targetLayer, 9);
});
