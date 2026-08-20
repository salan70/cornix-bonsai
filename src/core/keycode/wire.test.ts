import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseVil } from "../vil/parse.ts";
import { decodeVialKeycode, encodeVialKeycode, KeycodeEncodingError } from "./wire.ts";

test("Vial protocol 6のbasic・modifier・layer・dynamic keycodeをu16へ変換する", () => {
  deepStrictEqual(
    ["KC_A", "SGUI_T(KC_S)", "LT1(KC_LANG2)", "MO(4)", "TD(1)", "USER02"].map((keycode) =>
      encodeVialKeycode(keycode, 6),
    ),
    [0x0004, 0x2a16, 0x4191, 0x5224, 0x5701, 0x7e02],
  );
  strictEqual(encodeVialKeycode("0x1234", 6), 0x1234);
});

test("未対応表記や別protocolをKC_NOへ落とさず拒否する", () => {
  throws(() => encodeVialKeycode("KC_BOGUS", 6), KeycodeEncodingError);
  throws(() => encodeVialKeycode("KC_A", 5), KeycodeEncodingError);
});

test("wire値をencoderと同じ語彙の表記へ戻す", () => {
  deepStrictEqual(
    [0x0004, 0x2a16, 0x4191, 0x5224, 0x5701, 0x7e02, 0x021e, 0x1904].map((value) =>
      decodeVialKeycode(value, 6, { tapDanceCount: 32, macroCount: 32 }),
    ),
    [
      "KC_A",
      "SGUI_T(KC_S)",
      "LT1(KC_LANG2)",
      "MO(4)",
      "TD(1)",
      "USER02",
      "LSFT(KC_1)",
      "RCG(KC_A)",
    ],
  );
});

test("表記へ戻せないwire値はKC_NOへ落とさず数値表記で保つ", () => {
  // 0x0b はencoderに表記が無いmodifier、0x5720 は実機申告capacity外のtap dance。
  strictEqual(decodeVialKeycode(0x0b04, 6, {}), "0x0b04");
  strictEqual(decodeVialKeycode(0x5720, 6, { tapDanceCount: 32 }), "0x5720");
  strictEqual(decodeVialKeycode(0x5701, 6, { tapDanceCount: 32 }), "TD(1)");
  strictEqual(encodeVialKeycode(decodeVialKeycode(0x0b04, 6, {}), 6), 0x0b04);
  throws(() => decodeVialKeycode(0x0004, 5), KeycodeEncodingError);
});

test("baselineの全key/encoder keycodeがencode→decode→encodeで同値になる", async () => {
  const baseline = parseVil(
    await readFile(new URL("../../../fixtures/cornix-lp/baseline.vil", import.meta.url), "utf8"),
  );
  const capacities = { tapDanceCount: baseline.tapDance.length, macroCount: 32 };
  const keycodes = new Set<string>();
  for (const layer of baseline.layout)
    for (const row of layer) for (const key of row) if (typeof key === "string") keycodes.add(key);
  for (const layer of baseline.encoderLayout)
    for (const encoder of layer) for (const key of encoder) keycodes.add(key);

  strictEqual(keycodes.size > 0, true);
  for (const keycode of keycodes) {
    const wire = encodeVialKeycode(keycode, 6);
    strictEqual(decodeVialKeycode(wire, 6, capacities), keycode);
  }
});
