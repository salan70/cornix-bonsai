import type { JSX } from "react";
import type { KeycodeDisplay } from "./keycode-labels.ts";
import { FitText } from "./components/ui/index.ts";

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
      <FitText className="keycap-main">
        {prefix}
        {display.primary}
      </FitText>
      {display.role === undefined ? null : (
        <FitText as="small" className="keycap-sub">
          {display.role}
        </FitText>
      )}
    </>
  );
}
