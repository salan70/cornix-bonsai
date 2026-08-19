import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import { encodeVialKeycode, KeycodeEncodingError } from "./wire.ts";

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
