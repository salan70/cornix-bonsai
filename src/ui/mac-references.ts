import type { MacDeviceIdentifier } from "../core/mac-keymap/types.ts";

export function describeDevices(devices: readonly MacDeviceIdentifier[]): string {
  if (devices.length === 0) return "なし";
  return devices
    .map((device) =>
      "builtIn" in device ? "内蔵キーボード" : `外付け ${device.vendorId}:${device.productId}`,
    )
    .join("、");
}

/** `device_if` の identifiers を Karabiner と同じ語彙で文言化する。写像表は持たない。 */
export function deviceIfText(devices: readonly MacDeviceIdentifier[]): string {
  const identifiers = devices.map((device) =>
    "builtIn" in device
      ? "{ is_built_in_keyboard: true }"
      : `{ vendor_id: ${device.vendorId}, product_id: ${device.productId} }`,
  );
  return `[${identifiers.join(", ")}]`;
}
