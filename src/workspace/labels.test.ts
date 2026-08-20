import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_LABELS,
  keycodeLabel,
  layerLabel,
  parseLabelsYaml,
  serializeLabelsYaml,
  updateLayerLabel,
} from "./labels.ts";

test("labels@1はlayer名だけのlegacy形式として読み込める", () => {
  const labels = parseLabelsYaml(
    ["schema: cornix-bonsai/labels@1", "layers:", '  0: "Base"'].join("\n"),
  );

  strictEqual(layerLabel(labels, 0), "Base");
  deepStrictEqual([...labels.keycodes], []);
});

test("labels@2はkeycode式と日本語名をround-tripする", () => {
  const source = [
    "schema: cornix-bonsai/labels@2",
    "layers:",
    '  0: "Base"',
    "keycodes:",
    '  "LCG(KC_Q)": "アプリ終了"',
    '  "SGUI(KC_2)": "画面切替: 左"',
  ].join("\n");
  const labels = parseLabelsYaml(source);

  strictEqual(keycodeLabel(labels, "LCG(KC_Q)"), "アプリ終了");
  strictEqual(keycodeLabel(labels, "LCG(KC_Q)") === keycodeLabel(labels, "KC_Q"), false);
  strictEqual(serializeLabelsYaml(labels), `${source}\n`);
});

test("表示名が空ならparseを拒否し、空のlabelsは安全な既定値になる", async () => {
  await rejects(
    async () => parseLabelsYaml('schema: cornix-bonsai/labels@2\nkeycodes:\n  "KC_A": "  "'),
    /名前が空/,
  );
  strictEqual(keycodeLabel(EMPTY_LABELS, "KC_A"), undefined);
});

test("serializeはkeycodeを安定した辞書順で出力する", () => {
  const labels = parseLabelsYaml(
    [
      "schema: cornix-bonsai/labels@2",
      "layers:",
      "keycodes:",
      '  "SGUI(KC_2)": "画面切替"',
      '  "LCG(KC_Q)": "アプリ終了"',
    ].join("\n"),
  );

  strictEqual(
    serializeLabelsYaml(labels),
    [
      "schema: cornix-bonsai/labels@2",
      "layers:",
      "keycodes:",
      '  "LCG(KC_Q)": "アプリ終了"',
      '  "SGUI(KC_2)": "画面切替"',
      "",
    ].join("\n"),
  );
});

test("layer名更新はtrimし、空文字で名前を削除する", () => {
  const named = updateLayerLabel(EMPTY_LABELS, 2, "  Nav  ");
  strictEqual(layerLabel(named, 2), "Nav");
  strictEqual(layerLabel(updateLayerLabel(named, 2, "   "), 2), "layer 2");
});

test("layer名は重複を許し、他の表示名を変更しない", () => {
  const first = updateLayerLabel(EMPTY_LABELS, 0, "Base");
  const both = updateLayerLabel(first, 1, "Base");
  deepStrictEqual(
    [...both.layers.entries()],
    [
      [0, "Base"],
      [1, "Base"],
    ],
  );
});
