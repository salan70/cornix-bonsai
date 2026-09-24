/**
 * 機能アイコンの見た目。`dish` は天面の凹みを淡い面で描く組（keycap-dish-fill）、`flat` は凹みの無い組（keycap-squircle）。
 *
 * @doc docs/specs/ui.md#icons
 */
export type IconStyle = "flat" | "dish";

export const DEFAULT_ICON_STYLE: IconStyle = "dish";

export const ICON_STYLE_STORAGE_KEY = "cornix-bonsai.icon-style";

interface IconStyleStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

/** @doc docs/specs/ui.md#icons */
export function parseIconStyle(value: string | null | undefined): IconStyle {
  return value === "flat" || value === "dish" ? value : DEFAULT_ICON_STYLE;
}

/** @doc docs/specs/ui.md#icons */
export function loadIconStyle(storage: IconStyleStorage | undefined): IconStyle {
  if (storage === undefined) return DEFAULT_ICON_STYLE;
  try {
    return parseIconStyle(storage.getItem(ICON_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_ICON_STYLE;
  }
}

/** @doc docs/specs/ui.md#icons */
export function saveIconStyle(storage: IconStyleStorage | undefined, style: IconStyle): void {
  try {
    storage?.setItem(ICON_STYLE_STORAGE_KEY, style);
  } catch {
    // Storage access can be blocked by browser privacy settings. The in-memory
    // selection remains active even when persistence is unavailable.
  }
}

/** @doc docs/specs/ui.md#icons */
export function applyIconStyle(root: Pick<HTMLElement, "dataset">, style: IconStyle): void {
  root.dataset.iconStyle = style;
}
