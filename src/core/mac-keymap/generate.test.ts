/**
 * 生成器の検証。R-006 Spike の `self-check.mjs` が固定していた契約を、
 * `karabiner_cli` に依存しない範囲でここへ移した。以後はこの test が正で、
 * spike は判断時点の記録として凍結してある。
 */

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  generateKarabinerAsset,
  generateCornixProfile,
  generateKarabinerRules,
} from "./generate.ts";
import type { KarabinerManipulator } from "./karabiner.ts";
import { parseMacKeymapYaml } from "./parse.ts";
import { DEFAULT_MAC_DEVICES, type MacKeyboardLayout, type MacKeymapDocument } from "./types.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/mac-keyboard");
const DESIRED = parseMacKeymapYaml(readFileSync(join(FIXTURES, "desired.yaml"), "utf8"));

function documentOf(
  layers: readonly Record<string, string>[],
  layout: MacKeyboardLayout = "jis",
): MacKeymapDocument {
  return {
    layout,
    devices: DEFAULT_MAC_DEVICES,
    profile: "Cornix Bonsai",
    layers: new Map(
      layers.map((assignments, layer) => [layer, new Map(Object.entries(assignments))]),
    ),
  };
}

function manipulators(document: MacKeymapDocument): readonly KarabinerManipulator[] {
  return generateKarabinerRules(document).rules.flatMap((rule) => rule.manipulators);
}

function byKey(document: MacKeymapDocument, keyCode: string): readonly KarabinerManipulator[] {
  return manipulators(document).filter((one) => one.from.key_code === keyCode);
}

test("desired.yaml は diagnostic を出さない", () => {
  deepStrictEqual(generateKarabinerRules(DESIRED).diagnostics, []);
});

test("rule は layer 降順に並ぶ", () => {
  // rule は上から評価され最初にマッチしたものが勝つ。逆順だと layer 0 が上の layer を食う。
  deepStrictEqual(
    generateKarabinerRules(DESIRED).rules.map((rule) => rule.description),
    [
      "Cornix Bonsai layer 3",
      "Cornix Bonsai layer 2",
      "Cornix Bonsai layer 1",
      "Cornix Bonsai layer 0",
    ],
  );
});

test("MO(n) は set_variable と to_after_key_up を持つ", () => {
  const [manipulator] = byKey(DESIRED, "japanese_eisuu");
  deepStrictEqual(manipulator?.to, [{ set_variable: { name: "cornix_layer_2", value: 1 } }]);
  deepStrictEqual(manipulator?.to_after_key_up, [
    { set_variable: { name: "cornix_layer_2", value: 0 } },
  ]);
});

test("LT n(kc) は momentary に to_if_alone を足したもの", () => {
  const [manipulator] = byKey(DESIRED, "japanese_kana");
  deepStrictEqual(manipulator?.to, [{ set_variable: { name: "cornix_layer_1", value: 1 } }]);
  deepStrictEqual(manipulator?.to_if_alone, [{ key_code: "japanese_kana" }]);
});

test("mod-tap は lazy な modifier と to_if_alone になる", () => {
  // lazy を付けないと hold 側の modifier が単独で発火する。
  const [manipulator] = byKey(DESIRED, "caps_lock");
  deepStrictEqual(manipulator?.to, [{ key_code: "left_control", lazy: true }]);
  deepStrictEqual(manipulator?.to_if_alone, [{ key_code: "escape" }]);
});

test("TG(n) は 2 本に展開され、倒す側が先に来る", () => {
  // 順序を逆にすると押した直後に立て直してしまう。
  const found = byKey(DESIRED, "right_command");
  strictEqual(found.length, 2);
  deepStrictEqual(found[0]?.to, [{ set_variable: { name: "cornix_layer_3", value: 0 } }]);
  deepStrictEqual(found[0]?.conditions.at(-1), {
    type: "variable_if",
    name: "cornix_layer_3",
    value: 1,
  });
  deepStrictEqual(found[1]?.to, [{ set_variable: { name: "cornix_layer_3", value: 1 } }]);
  deepStrictEqual(found[1]?.conditions.at(-1), {
    type: "variable_unless",
    name: "cornix_layer_3",
    value: 1,
  });
});

test("KC_NO は to を持たない manipulator になる", () => {
  const [manipulator] = byKey(DESIRED, "q");
  strictEqual(manipulator?.to, undefined);
});

test("KC_TRNS は manipulator を出さない", () => {
  strictEqual(byKey(DESIRED, "w").length, 0);
});

test("layer 0 と同値のキーは manipulator を出さない", () => {
  // Karabiner は書かれていないキーを素通しするので、出さないことが正しい挙動になる。
  strictEqual(byKey(DESIRED, "caps_lock").length, 1);
});

test("全 manipulator が内蔵キーボード限定になる", () => {
  const all = manipulators(DESIRED);
  strictEqual(all.length > 0, true);
  for (const manipulator of all) {
    deepStrictEqual(manipulator.conditions[0], {
      type: "device_if",
      identifiers: [{ is_built_in_keyboard: true }],
    });
  }
});

test("layer 1 以上には variable_if が付く", () => {
  deepStrictEqual(byKey(DESIRED, "h")[0]?.conditions[1], {
    type: "variable_if",
    name: "cornix_layer_1",
    value: 1,
  });
});

test("修飾キーは素通しさせる", () => {
  deepStrictEqual(byKey(DESIRED, "h")[0]?.from, {
    key_code: "h",
    modifiers: { optional: ["any"] },
  });
});

test("落とせない keycode は黙って消えず error になる", () => {
  const broken = documentOf([{ z: "TD(0)", x: "LT1(TD(1))", c: "LCTL_T(M(0))", v: "LSFT(KC_1)" }]);
  const { rules, diagnostics } = generateKarabinerRules(broken);
  deepStrictEqual(rules, []);
  deepStrictEqual(
    diagnostics.map((one) => one.code),
    [
      // key_code 名の昇順（c / v / x / z）に出る。
      "mac-keymap/unsupported-mod-tap",
      "mac-keymap/unsupported-keycode",
      "mac-keymap/unsupported-layer-tap-inner",
      "mac-keymap/unsupported-keycode",
    ],
  );
  for (const diagnostic of diagnostics) strictEqual(diagnostic.severity, "error");
});

test("diagnostic は layer と key_code を指す", () => {
  const { diagnostics } = generateKarabinerRules(documentOf([{}, { z: "KC_BOGUS" }]));
  deepStrictEqual(diagnostics[0]?.subject, { kind: "macKey", layer: 1, keyCode: "z" });
});

test("MO / LT / TG 以外の layer 操作は落とせない", () => {
  const { diagnostics } = generateKarabinerRules(documentOf([{ a: "TO(1)", b: "OSL(2)" }]));
  strictEqual(diagnostics.length, 2);
  for (const diagnostic of diagnostics) strictEqual(diagnostic.severity, "error");
});

test("alias 表記も長い表記と同じ key_code へ落ちる", () => {
  // 表は canonical で持ち、引く前に canonicalKeycode で畳む（ADR 0001）。
  const short = generateKarabinerRules(documentOf([{ a: "KC_BSPC" }]));
  const long = generateKarabinerRules(documentOf([{ a: "KC_BSPACE" }]));
  deepStrictEqual(short.rules, long.rules);
  deepStrictEqual(short.rules[0]?.manipulators[0]?.to, [{ key_code: "delete_or_backspace" }]);
});

test("manipulator が 1 つも出ない layer は rule ごと省略する", () => {
  const { rules } = generateKarabinerRules(documentOf([{ a: "KC_A" }, { a: "KC_A" }]));
  deepStrictEqual(
    rules.map((rule) => rule.description),
    ["Cornix Bonsai layer 0"],
  );
});

test("asset は lint に渡せる形になる", () => {
  const { asset } = generateKarabinerAsset(DESIRED);
  strictEqual(asset.title, "Cornix Bonsai");
  strictEqual(asset.rules.length, 4);
});

test("profile は selected も simple_modifications も持たない", () => {
  // profile の切り替えはユーザーの操作（ADR 0022）。
  const { profile } = generateCornixProfile(DESIRED);
  strictEqual(profile.name, "Cornix Bonsai");
  strictEqual("selected" in profile, false);
  strictEqual("simple_modifications" in profile, false);
  // DESIRED（fixture）は layout: jis なので keyboard_type_v2 も jis になる（ADR 0024）。
  deepStrictEqual(profile.virtual_hid_keyboard, { keyboard_type_v2: "jis" });
});

test("keyboard_type_v2 は document の layout から導出する", () => {
  const { profile } = generateCornixProfile(documentOf([{ a: "KC_A" }], "ansi"));
  deepStrictEqual(profile.virtual_hid_keyboard, { keyboard_type_v2: "ansi" });
});

test("device_if の identifiers は document の devices から組む", () => {
  const document: MacKeymapDocument = {
    layout: "ansi",
    devices: [{ builtIn: true }, { vendorId: 1452, productId: 630 }],
    profile: "Cornix Bonsai",
    layers: new Map([[0, new Map([["caps_lock", "KC_ESCAPE"]])]]),
  };
  const { rules } = generateKarabinerRules(document);
  deepStrictEqual(rules[0]?.manipulators[0]?.conditions, [
    {
      type: "device_if",
      identifiers: [{ is_built_in_keyboard: true }, { vendor_id: 1452, product_id: 630 }],
    },
  ]);
});

test("layer 1 以上でも device 条件は先頭に残る", () => {
  const document: MacKeymapDocument = {
    layout: "ansi",
    devices: [{ vendorId: 1452, productId: 630 }],
    profile: "Cornix Bonsai",
    layers: new Map([
      [0, new Map([["caps_lock", "MO(1)"]])],
      [1, new Map([["h", "KC_LEFT"]])],
    ]),
  };
  const { rules } = generateKarabinerRules(document);
  const layerOne = rules.find((rule) => rule.description.endsWith("layer 1"));
  deepStrictEqual(layerOne?.manipulators[0]?.conditions, [
    { type: "device_if", identifiers: [{ vendor_id: 1452, product_id: 630 }] },
    { type: "variable_if", name: "cornix_layer_1", value: 1 },
  ]);
});
