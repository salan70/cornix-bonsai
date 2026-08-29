import type { JSX } from "react";
import type { KeycodeDisplay } from "./keycode-labels.ts";

export {
  basicLabel,
  describeDisplayKeycode,
  keycodeClass,
  keycodeDisplay,
  layerActionLabel,
  modifierSymbol,
  shortLabel,
} from "./keycode-labels.ts";
export type { DisplayOptions, KeycodeDisplay } from "./keycode-labels.ts";

export function renderKeycode(display: KeycodeDisplay, prefix = ""): JSX.Element {
  return (
    <>
      <span className="keycap-main">
        {prefix}
        {display.primary}
      </span>
      {display.role === undefined ? null : <small className="keycap-sub">{display.role}</small>}
    </>
  );
}
