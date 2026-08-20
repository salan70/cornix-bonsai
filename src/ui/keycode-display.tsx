import type { JSX } from "react";
import { describeKeycode } from "../core/diff/describe.ts";
import { classifyKeycode } from "../core/validation/keycode-vocabulary.ts";
import type { createKeycodeTable } from "../core/keycode/table.ts";
import { layerLabel, type WorkspaceLabels } from "../workspace/labels.ts";

export interface KeycodeDisplay {
  readonly primary: string;
  readonly role?: string;
}

/** keycap向けの表示option。`compact`はkeycapに収まる長さへ切り詰める。 */
export interface DisplayOptions {
  readonly compact?: boolean;
}

/** keycapに出すlayer名の上限。超えた分は`…`へ畳む。 */
const COMPACT_LABEL_LENGTH = 7;

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
  options: DisplayOptions = {},
): KeycodeDisplay {
  const lexeme = classifyKeycode(keycode);
  const layerName = (layer: number): string =>
    options.compact === true ? shorten(layerLabel(labels, layer)) : layerLabel(labels, layer);
  switch (lexeme.kind) {
    case "none":
      return options.compact === true ? { primary: "—" } : { primary: "—", role: "No action" };
    case "transparent":
      return options.compact === true ? { primary: "↓" } : { primary: "↓", role: "Transparent" };
    case "basic":
      return { primary: basicLabel(lexeme.name) };
    case "modified":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table, options).primary,
        role: modifierSymbol(lexeme.modifier),
      };
    case "modTap":
      return {
        primary: keycodeDisplay(lexeme.inner, labels, table, options).primary,
        role: `hold ${modifierSymbol(lexeme.modifier)}`,
      };
    case "oneShotMod":
      return { primary: modifierSymbol(lexeme.modifier), role: "one-shot" };
    case "layerSwitch":
      return {
        primary:
          lexeme.inner === undefined
            ? layerName(lexeme.layer)
            : keycodeDisplay(lexeme.inner, labels, table, options).primary,
        role:
          lexeme.inner === undefined
            ? layerActionLabel(lexeme.action)
            : `hold ${layerName(lexeme.layer)}`,
      };
    case "tapDance":
      return { primary: `TD ${lexeme.index}`, role: "Tap Dance" };
    case "macro":
      return { primary: `M ${lexeme.index}`, role: "Macro" };
    case "custom": {
      const resolved = table.resolve(keycode);
      return resolved.kind === "custom"
        ? { primary: shortLabel(resolved.shortName) }
        : { primary: keycode };
    }
    case "numeric":
      return { primary: keycode, role: "Numeric" };
    case "unknown":
      return { primary: keycode, role: "Unknown" };
  }
}

/** keycapへ出す短い表記。keycodeの綴りではなく、刻印に近い1〜2文字を優先する。 */
const SHORT_LABELS: Readonly<Record<string, string>> = {
  BSPACE: "⌫",
  DELETE: "⌦",
  ENTER: "⏎",
  ESCAPE: "Esc",
  GESC: "⎋",
  SPACE: "Space",
  TAB: "⇥",
  CAPSLOCK: "⇪",
  LCTRL: "⌃",
  LSHIFT: "⇧",
  LALT: "⌥",
  LGUI: "⌘",
  RCTRL: "⌃",
  RSHIFT: "⇧",
  RALT: "⌥",
  RGUI: "⌘",
  MUTE: "Mute",
  MINUS: "-",
  EQUAL: "=",
  LBRACKET: "[",
  RBRACKET: "]",
  BSLASH: "\\",
  SCOLON: ";",
  QUOTE: "'",
  GRAVE: "`",
  COMMA: ",",
  DOT: ".",
  SLASH: "/",
  LEFT: "←",
  RIGHT: "→",
  UP: "↑",
  DOWN: "↓",
  HOME: "Home",
  END: "End",
  PGUP: "PgUp",
  PGDOWN: "PgDn",
  LANG1: "かな",
  LANG2: "英数",
  INT1: "＼",
  INT3: "¥",
};

export function basicLabel(keycode: string): string {
  return shortLabel(keycode.replace(/^KC_/, ""));
}

/** `KC_`を外した名前、またはcustom keycodeのshort nameを短い表記へ寄せる。 */
export function shortLabel(name: string): string {
  return SHORT_LABELS[name] ?? name;
}

function shorten(label: string): string {
  return label.length <= COMPACT_LABEL_LENGTH ? label : `${label.slice(0, COMPACT_LABEL_LENGTH)}…`;
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

/** keycodeの語彙から意味別のclassを決める。盤面とOverviewで同じ分類を使う。 */
export function keycodeClass(keycode: string): string {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "modified":
      return "mod";
    case "modTap":
    case "oneShotMod":
      return "mod-tap";
    case "layerSwitch":
      return lexeme.inner === undefined ? "layer" : "layer-tap";
    case "tapDance":
      return "tapdance";
    case "custom":
    case "macro":
    case "numeric":
    case "unknown":
      return "custom";
    case "none":
      return "none";
    case "basic":
    case "transparent":
      return "basic";
  }
}
