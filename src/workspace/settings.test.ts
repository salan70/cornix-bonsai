import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { CORNIX_LP_V112_SETTINGS, settingLabel } from "./settings.ts";

test("Cornix LP V1.12のbaseline qsidを設定名へ表示できる", () => {
  deepStrictEqual(
    [...CORNIX_LP_V112_SETTINGS.entries()],
    [
      [2, "ComboTimeout"],
      [6, "OneShotTimeout"],
      [7, "MorseTimeout"],
      [18, "TapInterval"],
      [19, "TapCapslockInterval"],
      [22, "PermissiveHold"],
      [23, "HoldOnOtherKeyPress"],
      [26, "UnilateralTap"],
      [27, "PriorIdleTime"],
    ],
  );
});

test("辞書にないqsidはraw表記へフォールバックする", () => {
  strictEqual(settingLabel(22), "PermissiveHold");
  strictEqual(settingLabel(999), "qsid 999");
});
