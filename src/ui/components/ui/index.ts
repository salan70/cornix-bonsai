import { Button as ButtonComponent } from "./Button.tsx";
import { Chip as ChipComponent } from "./Chip.tsx";
import { Tag as TagComponent } from "./Tag.tsx";
import { Field as FieldComponent } from "./Field.tsx";
import { Section as SectionComponent } from "./Section.tsx";
import { Panel as PanelComponent } from "./Panel.tsx";
import { Callout as CalloutComponent, CalloutLabel as CalloutLabelComponent } from "./Callout.tsx";
import { FitText as FitTextComponent } from "./FitText.tsx";
export { SaveStatus } from "./SaveStatus.tsx";
export type { SaveState } from "./SaveStatus.tsx";

/** @doc docs/specs/design-system.md#react-primitive */
export const Button = ButtonComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Chip = ChipComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Tag = TagComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Field = FieldComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Section = SectionComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Panel = PanelComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const Callout = CalloutComponent;

/** @doc docs/specs/design-system.md#react-primitive */
export const CalloutLabel = CalloutLabelComponent;

/** @doc docs/specs/design-system.md#fittext-サイズ固定-文字を縮小 */
export const FitText = FitTextComponent;

export type { ButtonVariant } from "./Button.tsx";
export type { TagVariant } from "./Tag.tsx";
export type { CalloutTone } from "./Callout.tsx";
