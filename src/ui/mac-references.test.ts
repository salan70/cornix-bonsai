import { strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { describeDevices, deviceIfText } from "./mac-references.ts";

test("適用先の文言は内蔵と外付けを並べる", () => {
  strictEqual(describeDevices([{ builtIn: true }]), "内蔵キーボード");
  strictEqual(
    describeDevices([{ builtIn: true }, { vendorId: 1452, productId: 630 }]),
    "内蔵キーボード、外付け 1452:630",
  );
  strictEqual(describeDevices([]), "なし");
});

test("device_if の文言は Karabiner の identifiers と同じ語彙", () => {
  strictEqual(deviceIfText([{ builtIn: true }]), "[{ is_built_in_keyboard: true }]");
  strictEqual(
    deviceIfText([{ builtIn: true }, { vendorId: 1452, productId: 630 }]),
    "[{ is_built_in_keyboard: true }, { vendor_id: 1452, product_id: 630 }]",
  );
});
