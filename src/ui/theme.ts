/** @doc docs/specs/ui.md#light-dark-theme */
export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "cornix-bonsai.theme";

interface ThemeStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

/** @doc docs/specs/ui.md#light-dark-theme */
export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** @doc docs/specs/ui.md#light-dark-theme */
export function loadThemePreference(storage: ThemeStorage | undefined): ThemePreference {
  if (storage === undefined) return "system";
  try {
    return parseThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** @doc docs/specs/ui.md#light-dark-theme */
export function saveThemePreference(
  storage: ThemeStorage | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage access can be blocked by browser privacy settings. The in-memory
    // selection remains active even when persistence is unavailable.
  }
}

/** @doc docs/specs/ui.md#light-dark-theme */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

/** @doc docs/specs/ui.md#light-dark-theme */
export function applyTheme(
  root: Pick<HTMLElement, "dataset">,
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark);
  root.dataset.theme = resolved;
  return resolved;
}

export function browserThemeStorage(): ThemeStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function browserSystemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function subscribeToSystemTheme(
  preference: ThemePreference,
  listener: (systemDark: boolean) => void,
): () => void {
  if (preference !== "system" || typeof window === "undefined") return () => undefined;

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = (event: MediaQueryListEvent): void => listener(event.matches);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
