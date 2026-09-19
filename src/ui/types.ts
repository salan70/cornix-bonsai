import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";

/** header 直下のドロップダウンが選ぶ編集対象。配列を選ぶ専用 UI は置かない。 */
export type EditTarget =
  | { readonly kind: "cornix" }
  | { readonly kind: "mac"; readonly layout: MacKeyboardLayout };

export type CornixTab = "Keymap" | "Overview" | "Behaviors" | "References";

export type MacTab = "Keymap" | "References";

export type Selection =
  | { readonly kind: "key"; readonly row: number; readonly col: number }
  | { readonly kind: "encoder"; readonly index: number; readonly direction: "ccw" | "cw" }
  /** Mac盤面のキー。位置はKarabinerの`key_code`名（ADR 0025）。 */
  | { readonly kind: "macKey"; readonly keyCode: string };
