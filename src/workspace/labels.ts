/** `cornix/labels.yaml` の最小 subset。Apply の入力には含めない。 */

export interface WorkspaceLabels {
  readonly layers: ReadonlyMap<number, string>;
}

export const EMPTY_LABELS: WorkspaceLabels = { layers: new Map() };

export function parseLabelsYaml(text: string): WorkspaceLabels {
  const layers = new Map<number, string>();
  let inLayers = false;
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line === "layers:") {
      inLayers = true;
      continue;
    }
    if (!inLayers) {
      if (line.startsWith("schema:")) continue;
      throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
    }
    const match = /^([0-9]+):(?:\s+)(.*)$/.exec(line);
    if (match === null) throw new Error(`labels.yaml ${index + 1} 行目を解釈できない: ${rawLine}`);
    const layer = Number(match[1]);
    const value = match[2]?.trim();
    if (value === undefined || value === "") throw new Error(`layer ${layer} の名前が空`);
    layers.set(layer, unquote(value));
  }
  return { layers };
}

export function serializeLabelsYaml(labels: WorkspaceLabels): string {
  const lines = ["schema: cornix-bonsai/labels@1", "layers:"];
  for (const [layer, name] of [...labels.layers.entries()].sort(([a], [b]) => a - b)) {
    lines.push(`  ${layer}: ${quote(name)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function layerLabel(labels: WorkspaceLabels, layer: number): string {
  return labels.layers.get(layer) ?? `layer ${layer}`;
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
