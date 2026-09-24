/**
 * 機能アイコンの名前。`src/ui/icons/<組>/<名前>.svg` と 1 対 1 に対応する。
 *
 * @doc docs/specs/design-system.md#icon
 */
export const ICON_NAMES = [
  "keymap",
  "overview",
  "behaviors",
  "validation",
  "device",
  "files",
  "error",
  "warning",
  "info",
  "saving",
  "check",
  "close",
  "expand",
  "collapse",
  "rotate-ccw",
  "rotate-cw",
  "arrow-right",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * 写した SVG を、同じページへ何度でも埋め込める形にする。
 *
 * `part-*` の id は同じアイコンを 2 回置くと重複するため外す。
 * `<title>` と `role="img"` は、アイコンを読み上げから外し名前を隣の語か `aria-label` に持たせるため外す。
 *
 * @doc docs/specs/design-system.md#icon
 */
export function sanitizeIconSvg(svg: string): string {
  return svg
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\s+id="[^"]*"/g, "")
    .replace(/\s+role="img"/g, "");
}
