import { useEffect, useState } from "react";
import { applyIconStyle, loadIconStyle, saveIconStyle, type IconStyle } from "../icon-style.ts";
import { browserThemeStorage } from "../theme.ts";

const iconStyleStorage = browserThemeStorage();

/**
 * 機能アイコンの見た目（凹みあり / 凹みなし）。選択は localStorage へ保存し、`<html data-icon-style>` へ反映する。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useIconStyle(): {
  readonly style: IconStyle;
  readonly setStyle: (style: IconStyle) => void;
} {
  const [style, setStyleState] = useState<IconStyle>(() => loadIconStyle(iconStyleStorage));

  useEffect(() => {
    applyIconStyle(document.documentElement, style);
  }, [style]);

  function setStyle(next: IconStyle): void {
    setStyleState(next);
    saveIconStyle(iconStyleStorage, next);
  }

  return { style, setStyle };
}
