/**
 * `mac-keyboard.yaml` テキスト → desired state。
 *
 * **汎用の YAML parser ではない**。`serializeMacKeymapYaml` が出す部分集合だけを受け付け、
 * それ以外は `MacKeymapParseError` で落とす。desired state を黙って読み違えるより、
 * 読めないことを大きな声で言うほうが安全なため（ADR 0009 と同じ理由）。
 *
 * 受け付ける形はインデントの深さで決まる。2 が layer 番号、4 が割り当て。
 *
 */

import {
  DEFAULT_MAC_LAYOUT,
  MAC_KEYMAP_SCHEMA,
  MacKeymapParseError,
  type MacKeyboardLayout,
  type MacKeymapDocument,
} from "./types.ts";

const LAYER_PATTERN = /^ {2}([0-9]+):$/;
const ASSIGNMENT_PATTERN = /^ {4}("(?:\\.|[^"\\])*"):(?:\s+)(.*)$/;

/** @doc docs/specs/mac-keymap.md#parsemackeymapyaml */
export function parseMacKeymapYaml(text: string): MacKeymapDocument {
  let layout: MacKeyboardLayout | undefined;
  let profile: string | undefined;
  let sawLayers = false;
  let current: Map<string, string> | undefined;
  const layers = new Map<number, ReadonlyMap<string, string>>();

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trimEnd();
    const lineNumber = index + 1;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    if (line.startsWith("schema:")) {
      const schema = line.slice("schema:".length).trim();
      if (schema !== MAC_KEYMAP_SCHEMA) {
        throw new MacKeymapParseError(`mac-keyboard.yaml の schema が未対応: ${schema}`);
      }
      continue;
    }
    if (line.startsWith("layout:")) {
      const value = line.slice("layout:".length).trim();
      if (value !== "ansi" && value !== "jis") {
        throw new MacKeymapParseError(`mac-keyboard.yaml の layout が未対応: ${value}`);
      }
      layout = value;
      continue;
    }
    if (line.startsWith("profile:")) {
      profile = unquote(line.slice("profile:".length).trim(), lineNumber).trim();
      if (profile === "") throw new MacKeymapParseError("profile 名が空");
      continue;
    }
    if (line === "layers:") {
      sawLayers = true;
      continue;
    }

    if (!sawLayers) throw new MacKeymapParseError(`${lineNumber} 行目を解釈できない: ${rawLine}`);

    const layer = LAYER_PATTERN.exec(line);
    if (layer?.[1] !== undefined) {
      const number = Number(layer[1]);
      if (layers.has(number)) throw new MacKeymapParseError(`layer ${number} が重複している`);
      current = new Map<string, string>();
      layers.set(number, current);
      continue;
    }

    const assignment = ASSIGNMENT_PATTERN.exec(line);
    if (assignment?.[1] === undefined || assignment[2] === undefined || current === undefined) {
      throw new MacKeymapParseError(`${lineNumber} 行目を解釈できない: ${rawLine}`);
    }
    const keyCode = unquote(assignment[1], lineNumber);
    if (keyCode.trim() === "") throw new MacKeymapParseError("key_code が空");
    if (current.has(keyCode)) {
      throw new MacKeymapParseError(`${lineNumber} 行目の ${keyCode} が同じ layer で重複している`);
    }
    const keycode = unquote(assignment[2].trim(), lineNumber).trim();
    if (keycode === "") throw new MacKeymapParseError(`${keyCode} の keycode が空`);
    current.set(keyCode, keycode);
  }

  if (profile === undefined) throw new MacKeymapParseError("mac-keyboard.yaml に profile が無い");
  if (!sawLayers) throw new MacKeymapParseError("mac-keyboard.yaml に layers が無い");
  return { layout: layout ?? DEFAULT_MAC_LAYOUT, profile, layers };
}

function unquote(value: string, lineNumber: number): string {
  if (!value.startsWith('"')) return value;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new MacKeymapParseError(`${lineNumber} 行目の引用が壊れている: ${value}`);
  }
  if (typeof parsed !== "string") {
    throw new MacKeymapParseError(`${lineNumber} 行目の値が文字列ではない: ${value}`);
  }
  return parsed;
}
