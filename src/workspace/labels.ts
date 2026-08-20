/** `cornix/labels.yaml` の表示用 metadata。Apply の入力には含めない。 */

export interface WorkspaceLabels {
  readonly layers: ReadonlyMap<number, string>;
  /** raw keycode 式から表示名への完全一致 alias。 */
  readonly keycodes: ReadonlyMap<string, string>;
}

export const EMPTY_LABELS: WorkspaceLabels = { layers: new Map(), keycodes: new Map() };

/** @doc docs/specs/workspace-cli.md#表示名の仕様 */
export function parseLabelsYaml(text: string): WorkspaceLabels {
  const layers = new Map<number, string>();
  const keycodes = new Map<string, string>();
  let section: "layers" | "keycodes" | undefined;
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line === "layers:" || line === "keycodes:") {
      section = line.slice(0, -1) as "layers" | "keycodes";
      continue;
    }
    if (line.startsWith("schema:")) {
      const schema = line.slice("schema:".length).trim();
      if (schema !== "cornix-bonsai/labels@1" && schema !== "cornix-bonsai/labels@2") {
        throw new Error(`labels.yaml のschemaが未対応: ${schema}`);
      }
      continue;
    }
    if (section === undefined) {
      throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
    }
    if (section === "layers") {
      const match = /^([0-9]+):(?:\s+)(.*)$/.exec(line);
      if (match === null)
        throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
      const layer = Number(match[1]);
      const value = match[2]?.trim();
      if (value === undefined || value === "") throw new Error(`layer ${layer} の名前が空`);
      const name = unquote(value).trim();
      if (name === "") throw new Error(`layer ${layer} の名前が空`);
      layers.set(layer, name);
      continue;
    }
    const match = /^("(?:\\.|[^"\\])*"):(?:\s+)(.*)$/.exec(line);
    if (match === null) throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
    const rawKeycode = match[1];
    if (rawKeycode === undefined)
      throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
    const keycode = unquote(rawKeycode);
    if (keycode.trim() === "") throw new Error("keycodeの表示名に空のkeycodeは使えない");
    const value = match[2]?.trim();
    if (value === undefined || value === "") throw new Error(`keycode ${keycode} の名前が空`);
    const name = unquote(value).trim();
    if (name === "") throw new Error(`keycode ${keycode} の名前が空`);
    keycodes.set(keycode, name);
  }
  return { layers, keycodes };
}

/** @doc docs/specs/workspace-cli.md#表示名の仕様 */
export function serializeLabelsYaml(labels: WorkspaceLabels): string {
  const lines = ["schema: cornix-bonsai/labels@2", "layers:"];
  for (const [layer, name] of [...labels.layers.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`  ${layer}: ${quote(name)}`);
  }
  lines.push("keycodes:");
  for (const [keycode, name] of [...labels.keycodes.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    lines.push(`  ${quote(keycode)}: ${quote(name)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function layerLabel(labels: WorkspaceLabels, layer: number): string {
  return labels.layers.get(layer) ?? `layer ${layer}`;
}

/** layer名を更新する。空文字は名前を削除し、未指定時の`layer N`表示へ戻す。 */
export function updateLayerLabel(
  labels: WorkspaceLabels,
  layer: number,
  value: string,
): WorkspaceLabels {
  const layers = new Map(labels.layers);
  const name = value.trim();
  if (name === "") layers.delete(layer);
  else layers.set(layer, name);
  return { ...labels, layers };
}

/**
 * raw keycode式の完全一致表示名。名前が無ければundefinedを返す。
 * @doc docs/specs/workspace-cli.md#表示名の仕様
 */
export function keycodeLabel(labels: WorkspaceLabels, keycode: string): string | undefined {
  return labels.keycodes.get(keycode);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function unquote(value: string): string {
  if (value.startsWith('"')) {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "string") throw new Error(`labels.yaml の値が文字列ではない: ${value}`);
    return parsed;
  }
  return value;
}
