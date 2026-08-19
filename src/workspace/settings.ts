/**
 * Cornix LP公式 firmware V1.12（RMK v0.8.2）のsettings表示名。
 *
 * `.vil` / `keymap.yaml`の保存形式はqsidを保持したままにし、これはUIの表示だけに使う。
 * この表にないqsidはraw表記へフォールバックする。
 */
export const CORNIX_LP_V112_SETTINGS: ReadonlyMap<number, string> = new Map([
  [2, "ComboTimeout"],
  [6, "OneShotTimeout"],
  [7, "MorseTimeout"],
  [18, "TapInterval"],
  [19, "TapCapslockInterval"],
  [22, "PermissiveHold"],
  [23, "HoldOnOtherKeyPress"],
  [26, "UnilateralTap"],
  [27, "PriorIdleTime"],
]);

export function settingLabel(qsid: number): string {
  return CORNIX_LP_V112_SETTINGS.get(qsid) ?? `qsid ${qsid}`;
}
