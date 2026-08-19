/**
 * `keymap.yaml` テキスト → raw ドキュメントと definition の対応づけ。
 *
 * **汎用の YAML parser ではない**。`serializeKeymapYaml` が出す部分集合だけを受け付け、
 * それ以外は `KeymapYamlParseError` で落とす（ADR 0009）。desired state を黙って
 * 読み違えるより、読めないことを大きな声で言うほうが安全なため。
 *
 * 部分集合に限れるので、flow sequence 1 行はそのまま `JSON.parse` に通せる。
 *
 */

import type {
  VilComboEntry,
  VilDocument,
  VilEncoderLayout,
  VilKeyEntry,
  VilLayout,
  VilTapDanceEntry,
} from "../vil/types.ts";
import { KEYMAP_YAML_SCHEMA, KeymapYamlParseError, type DefinitionBinding } from "./types.ts";

/** parse の結果。`keymap.yaml` は raw と対応づけの両方を運ぶ。 */
export interface ParsedKeymapYaml {
  readonly document: VilDocument;
  readonly binding: DefinitionBinding;
}

/** comment と空行を落とした行の列を、位置を保ったまま読み進める。 */
class LineCursor {
  private index = 0;
  private readonly lines: readonly string[];

  constructor(lines: readonly string[]) {
    this.lines = lines;
  }

  peek(): string | undefined {
    return this.lines[this.index];
  }

  next(): string {
    const line = this.lines[this.index];
    if (line === undefined) throw new KeymapYamlParseError("keymap.yaml が途中で終わっている");
    this.index += 1;
    return line;
  }

  /** 次の行が `prefix` で始まっていることを要求し、続きを返す。 */
  expect(prefix: string): string {
    const line = this.next();
    if (!line.startsWith(prefix)) {
      throw new KeymapYamlParseError(`"${prefix}" を期待したが "${line}" だった`);
    }
    return line.slice(prefix.length);
  }

  atEnd(): boolean {
    return this.index >= this.lines.length;
  }
}

function parseScalarString(text: string, context: string): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new KeymapYamlParseError(`${context} を文字列として読めない: ${text}`);
  }
  if (typeof value !== "string") {
    throw new KeymapYamlParseError(`${context} は引用した文字列でなければならない: ${text}`);
  }
  return value;
}

function parseScalarNumber(text: string, context: string): number {
  const value = Number(text);
  if (text.trim() === "" || Number.isNaN(value)) {
    throw new KeymapYamlParseError(`${context} は number でなければならない: ${text}`);
  }
  return value;
}

/** flow sequence 1 行。要素は JSON 互換なので `JSON.parse` に通せる。 */
function parseFlow(text: string, context: string): unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new KeymapYamlParseError(`${context} を flow sequence として読めない: ${text}`);
  }
  if (!Array.isArray(value)) {
    throw new KeymapYamlParseError(`${context} は flow sequence でなければならない: ${text}`);
  }
  return value;
}

/** `layers:` / `encoders:` の block。row が 1 行で、layer の切れ目は `  - ` で始まる行。 */
function parseLayerBlock(cursor: LineCursor, label: string): VilKeyEntry[][][] {
  const layers: VilKeyEntry[][][] = [];
  for (;;) {
    const line = cursor.peek();
    if (line === undefined || !line.startsWith("  ")) break;
    cursor.next();
    if (line === "  - []") {
      layers.push([]);
      continue;
    }
    if (line.startsWith("  - - ")) {
      layers.push([
        parseFlow(line.slice(6), `${label} の row`).map((value) => toKeyEntry(value, label)),
      ]);
      continue;
    }
    if (line.startsWith("    - ")) {
      const layer = layers.at(-1);
      if (layer === undefined) {
        throw new KeymapYamlParseError(`${label} の row が layer の外にある: ${line}`);
      }
      layer.push(
        parseFlow(line.slice(6), `${label} の row`).map((value) => toKeyEntry(value, label)),
      );
      continue;
    }
    throw new KeymapYamlParseError(`${label} の行として読めない: ${line}`);
  }
  return layers;
}

/** layout の 1 マス。keycode 文字列か、物理キー無しを示す数値だけを許す。 */
function toKeyEntry(value: unknown, label: string): VilKeyEntry {
  if (typeof value === "string" || typeof value === "number") return value;
  throw new KeymapYamlParseError(
    `${label} の要素は文字列か数値でなければならない: ${String(value)}`,
  );
}

/** `tap_dance[index]` = `[tap, hold, double tap, hold after tap, timeout]`。arity も検査する。 */
function toTapDanceEntry(entry: readonly unknown[]): VilTapDanceEntry {
  const [tap, hold, doubleTap, holdAfterTap, timeout] = entry;
  if (
    entry.length !== 5 ||
    typeof tap !== "string" ||
    typeof hold !== "string" ||
    typeof doubleTap !== "string" ||
    typeof holdAfterTap !== "string" ||
    typeof timeout !== "number"
  ) {
    throw new KeymapYamlParseError(
      `tapDance は [文字列 4 個, 数値 1 個] でなければならない: ${JSON.stringify(entry)}`,
    );
  }
  return [tap, hold, doubleTap, holdAfterTap, timeout];
}

/** `combo[index]` = `[入力 4, 出力 1]`。arity も検査する。 */
function toComboEntry(entry: readonly unknown[]): VilComboEntry {
  if (entry.length !== 5 || entry.some((value) => typeof value !== "string")) {
    throw new KeymapYamlParseError(
      `combo は文字列 5 個でなければならない: ${JSON.stringify(entry)}`,
    );
  }
  const [a, b, c, d, output] = entry as readonly string[];
  return [a as string, b as string, c as string, d as string, output as string];
}

/** `  - [...]` が続くだけの block。 */
function parseEntryBlock(cursor: LineCursor, label: string): unknown[][] {
  const entries: unknown[][] = [];
  for (;;) {
    const line = cursor.peek();
    if (line === undefined || !line.startsWith("  - ")) break;
    cursor.next();
    entries.push(parseFlow(line.slice(4), label));
  }
  return entries;
}

/**
 * `keymap.yaml` を raw ドキュメントと対応づけへ読み込む。
 *
 * `serializeKeymapYaml` の出力と往復して等価になることがこの関数の契約。
 * comment 行と空行は捨てる。注記は往復の対象ではない（ADR 0009）。
 *
 * @doc docs/specs/keymap-yaml.md#parsekeymapyaml
 */
export function parseKeymapYaml(text: string): ParsedKeymapYaml {
  const rawLines = text.split("\n");
  const cursor = new LineCursor(
    rawLines.filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#")),
  );

  const schema = cursor.expect("schema: ");
  if (schema !== KEYMAP_YAML_SCHEMA) {
    throw new KeymapYamlParseError(
      `未知の schema: ${schema}（期待した値は ${KEYMAP_YAML_SCHEMA}）`,
    );
  }

  cursor.expect("keyboard:");
  const keyboardUid = parseScalarString(cursor.expect("  uid: "), "keyboard.uid");
  const keyboardName = parseScalarString(cursor.expect("  name: "), "keyboard.name");

  cursor.expect("definition:");
  const definitionPath = parseScalarString(cursor.expect("  path: "), "definition.path");
  const definitionDigest = parseScalarString(cursor.expect("  digest: "), "definition.digest");

  cursor.expect("vial:");
  const version = parseScalarNumber(cursor.expect("  version: "), "vial.version");
  const vialProtocol = parseScalarNumber(cursor.expect("  vialProtocol: "), "vial.vialProtocol");
  const viaProtocol = parseScalarNumber(cursor.expect("  viaProtocol: "), "vial.viaProtocol");
  const layoutOptions = parseScalarNumber(cursor.expect("  layoutOptions: "), "vial.layoutOptions");

  cursor.expect("layers:");
  const layout = parseLayerBlock(cursor, "layers") as VilLayout;

  cursor.expect("encoders:");
  // encoder は物理キー無しの `-1` を持たない。数値が混ざっていたらここで落とす。
  const encoderLayout: VilEncoderLayout = parseLayerBlock(cursor, "encoders").map((layer) =>
    layer.map((encoder) =>
      encoder.map((direction) => {
        if (typeof direction !== "string") {
          throw new KeymapYamlParseError(
            `encoders の要素は文字列でなければならない: ${String(direction)}`,
          );
        }
        return direction;
      }),
    ),
  );

  cursor.expect("tapDance:");
  const tapDance = parseEntryBlock(cursor, "tapDance").map(toTapDanceEntry);

  cursor.expect("combo:");
  const combo = parseEntryBlock(cursor, "combo").map(toComboEntry);

  cursor.expect("settings:");
  const settings: Record<string, number> = {};
  for (;;) {
    const line = cursor.peek();
    if (line === undefined || !line.startsWith("  ")) break;
    cursor.next();
    const separator = line.indexOf(": ");
    if (separator < 0) {
      throw new KeymapYamlParseError(`settings の行として読めない: ${line}`);
    }
    const qsid = parseScalarString(line.slice(2, separator), "settings の qsid");
    settings[qsid] = parseScalarNumber(line.slice(separator + 2), `settings["${qsid}"]`);
  }

  cursor.expect("raw:");
  const keyOrder = parseFlow(cursor.expect("  keyOrder: "), "raw.keyOrder") as string[];
  cursor.expect("  json: |");
  const jsonLines: string[] = [];
  for (;;) {
    const line = cursor.peek();
    if (line === undefined || !line.startsWith("    ")) break;
    jsonLines.push(cursor.next().slice(4));
  }
  if (!cursor.atEnd()) {
    throw new KeymapYamlParseError(`raw.json の後に余分な行がある: ${String(cursor.peek())}`);
  }

  let opaque: unknown;
  try {
    opaque = JSON.parse(jsonLines.join("\n"));
  } catch (cause) {
    throw new KeymapYamlParseError(`raw.json を JSON として読めない: ${String(cause)}`);
  }
  if (opaque === null || typeof opaque !== "object" || Array.isArray(opaque)) {
    throw new KeymapYamlParseError("raw.json は object でなければならない");
  }
  const fields = opaque as Record<string, unknown>;

  return {
    binding: { keyboardUid, keyboardName, definitionPath, definitionDigest },
    document: {
      version,
      uid: keyboardUid,
      layout,
      encoderLayout,
      layoutOptions,
      macro: requireOpaqueArray(fields, "macro"),
      vialProtocol,
      viaProtocol,
      tapDance,
      combo,
      keyOverride: requireOpaqueArray(fields, "key_override"),
      altRepeatKey: requireOpaqueArray(fields, "alt_repeat_key"),
      settings,
      raw: { keyOrder, unknown: requireOpaqueObject(fields, "unknown") },
    },
  };
}

function requireOpaqueArray(fields: Record<string, unknown>, key: string): readonly unknown[] {
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new KeymapYamlParseError(`raw.json の "${key}" は array でなければならない`);
  }
  return value;
}

function requireOpaqueObject(
  fields: Record<string, unknown>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = fields[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new KeymapYamlParseError(`raw.json の "${key}" は object でなければならない`);
  }
  return value as Record<string, unknown>;
}
