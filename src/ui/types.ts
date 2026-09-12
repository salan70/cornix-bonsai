export type Tab = "Keymap" | "Overview" | "Behaviors" | "Mac" | "References";

export type Selection =
  | { readonly kind: "key"; readonly row: number; readonly col: number }
  | { readonly kind: "encoder"; readonly index: number; readonly direction: "ccw" | "cw" }
  /** Mac盤面のキー。位置はKarabinerの`key_code`名（ADR 0025）。 */
  | { readonly kind: "macKey"; readonly keyCode: string };
