import type { JSX } from "react";
import { describeKeycode } from "../core/diff/describe.ts";
import { classifyKeycode } from "../core/validation/keycode-vocabulary.ts";
import type { createKeycodeTable } from "../core/keycode/table.ts";
import { layerLabel, type WorkspaceLabels } from "../workspace/labels.ts";

export interface KeycodeDisplay {
  readonly primary: string;
  readonly role?: string;
}

export function renderKeycode(display: KeycodeDisplay, prefix = ""): JSX.Element {
  return (
    <>
      <span className="m">
        {prefix}
        {display.primary}
      </span>
      {display.role === undefined ? null : <small className="s">{display.role}</small>}
    </>
  );
}

export function keycodeDisplay(
  keycode: string,
  labels: WorkspaceLabels,
  table: ReturnType<typeof createKeycodeTable>,
): KeycodeDisplay {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "none":
      return { primary: "—", role: "No action" };
    case "transparent":
      return { primary: "↓", role: "Transparent" };
    case "basic":
      return { primary: basicLabel(lexeme.name) };
    case "modified":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table).primary,
        role: modifierSymbol(lexeme.modifier),
      };
    case "modTap":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table).primary,
        role: `hold ${modifierSymbol(lexeme.modifier)}`,
      };
    case "oneShotMod":
      return { primary: modifierSymbol(lexeme.modifier), role: "one-shot" };
    case "layerSwitch":
      return {
        primary:
          lexeme.inner === undefined
            ? layerLabel(labels, lexeme.layer)
            : keycodeDisplay(lexeme.inner, labels, table).primary,
        role:
          lexeme.inner === undefined
            ? layerActionLabel(lexeme.action)
            : `hold ${layerLabel(labels, lexeme.layer)}`,
      };
    case "tapDance":
      return { primary: `TD ${lexeme.index}`, role: "Tap Dance" };
    case "macro":
      return { primary: `M ${lexeme.index}`, role: "Macro" };
    case "custom": {
      const resolved = table.resolve(keycode);
      return resolved.kind === "custom" ? { primary: resolved.shortName } : { primary: keycode };
    }
    case "numeric":
      return { primary: keycode, role: "Numeric" };
    case "unknown":
      return { primary: keycode, role: "Unknown" };
  }
}

export function basicLabel(keycode: string): string {
  const withoutPrefix = keycode.replace(/^KC_/, "");
  const labels: Readonly<Record<string, string>> = {
    BSPACE: "⌫",
    ENTER: "⏎",
    ESCAPE: "Esc",
    SPACE: "Space",
    TAB: "⇥",
    LCTRL: "⌃",
    LSHIFT: "⇧",
    LALT: "⌥",
    LGUI: "⌘",
    MUTE: "Mute",
  };
  return labels[withoutPrefix] ?? withoutPrefix;
}

export function modifierSymbol(modifier: string): string {
  if (["LGUI", "RGUI", "SGUI", "LCMD", "RCMD", "SCMD", "SWIN"].includes(modifier)) return "⌘";
  if (["LALT", "RALT", "LAG", "RAG"].includes(modifier)) return "⌥";
  if (["LCTL", "RCTL", "LCG", "RCG", "LCA", "RCA"].includes(modifier)) return "⌃";
  if (["LSFT", "RSFT", "LSA", "RSA"].includes(modifier)) return "⇧";
  if (modifier === "HYPR") return "⌘⌥⌃⇧";
  if (modifier === "MEH") return "⌥⌃⇧";
  return modifier;
}

export function layerActionLabel(action: string): string {
  switch (action) {
    case "momentary":
    case "layerTap":
    case "layerMod":
      return "hold";
    case "toggle":
      return "toggle";
    case "to":
      return "stay";
    case "tapToggle":
      return "tap-toggle";
    case "default":
      return "default";
    case "oneShot":
      return "one-shot";
    default:
      return action;
  }
}

export function describeDisplayKeycode(
  keycode: string,
  table: ReturnType<typeof createKeycodeTable>,
): string {
  return describeKeycode(keycode, table);
}
