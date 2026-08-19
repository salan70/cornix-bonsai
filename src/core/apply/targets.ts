/** Applyで扱う単一entryの位置。実機I/Oを含まないcore共通の識別子。 */
export type WriteTarget =
  | { readonly kind: "key"; readonly layer: number; readonly row: number; readonly col: number }
  | {
      readonly kind: "encoder";
      readonly layer: number;
      readonly index: number;
      readonly direction: number;
    }
  | { readonly kind: "tapDance"; readonly index: number }
  | { readonly kind: "combo"; readonly index: number }
  | { readonly kind: "setting"; readonly qsid: number };

/** `WriteTarget`を`DeviceSnapshot`とvalidated desiredの共通keyへ直列化する。 */
export function targetKey(target: WriteTarget): string {
  switch (target.kind) {
    case "key":
      return `key:${target.layer}:${target.row}:${target.col}`;
    case "encoder":
      return `encoder:${target.layer}:${target.index}:${target.direction}`;
    case "tapDance":
      return `tapDance:${target.index}`;
    case "combo":
      return `combo:${target.index}`;
    case "setting":
      return `setting:${target.qsid}`;
  }
}
