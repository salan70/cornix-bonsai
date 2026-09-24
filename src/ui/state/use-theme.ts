import { useEffect, useState } from "react";
import {
  applyTheme,
  browserSystemDark,
  browserThemeStorage,
  loadThemePreference,
  saveThemePreference,
  subscribeToSystemTheme,
  type ThemePreference,
} from "../theme.ts";

const themeStorage = browserThemeStorage();

/** 起動直後の描画前に `<html data-theme>` を決め、初回だけ違う配色で描かれるのを避ける。 */
export function applyInitialTheme(): ThemePreference {
  const preference = loadThemePreference(themeStorage);
  applyTheme(document.documentElement, preference, browserSystemDark());
  return preference;
}

/**
 * テーマの選択（system / light / dark）。選択は localStorage へ保存し、system は OS 設定の変化へ追従する。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useTheme(initial: ThemePreference): {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(initial);

  useEffect(() => {
    const apply = (systemDark: boolean): void => {
      applyTheme(document.documentElement, preference, systemDark);
    };
    apply(browserSystemDark());
    return subscribeToSystemTheme(preference, apply);
  }, [preference]);

  function setPreference(next: ThemePreference): void {
    setPreferenceState(next);
    saveThemePreference(themeStorage, next);
  }

  return { preference, setPreference };
}
