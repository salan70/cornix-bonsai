export type Tab = "Keymap" | "Overview" | "Behaviors" | "References";

export type Selection =
  | { readonly kind: "key"; readonly row: number; readonly col: number }
  | { readonly kind: "encoder"; readonly index: number; readonly direction: "ccw" | "cw" };
