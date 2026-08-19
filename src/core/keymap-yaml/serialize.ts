/**
 * raw ドキュメント → `keymap.yaml` テキスト。
 *
 * 並べ方は D-002 Spike の案 B（`spikes/d-002-keymap-yaml/`）。row を flow sequence で
 * 1 行に置き、物理配列の格子を diff の hunk に残す。
 *
 */

import type { VilDocument } from "../vil/types.ts";
import { KEYMAP_YAML_SCHEMA, type DefinitionBinding } from "./types.ts";

/**
 * Cornix Bonsai が解釈しない field をまとめて持ち回るための塊。
 *
 * `macro` / `key_override` / `alt_repeat_key` / 未知の top-level field は、意味を持たせずに
 * そのまま往復させる（ADR 0001）。YAML の構造へ展開すると解釈したことになるため、
 * JSON のまま block scalar へ入れる。
 */
interface OpaqueFields {
  readonly macro: readonly unknown[];
  readonly key_override: readonly unknown[];
  readonly alt_repeat_key: readonly unknown[];
  readonly unknown: Readonly<Record<string, unknown>>;
}

/** YAML の scalar 1 個。keycode は必ず引用する。 */
function scalar(value: string | number): string {
  return typeof value === "number" ? String(value) : JSON.stringify(value);
}

/** flow sequence 1 行。要素は JSON 互換の scalar なので、この行はそのまま JSON にもなる。 */
function flow(values: readonly (string | number)[]): string {
  return `[${values.map(scalar).join(", ")}]`;
}

/** layer ごとの block。row は 1 行。layer が空なら `[]` を 1 行で置く。 */
function emitLayers(
  label: string,
  layers: readonly (readonly (readonly (string | number)[])[])[],
): string[] {
  const lines = [`${label}:`];
  layers.forEach((layer, layerIndex) => {
    lines.push(`  # layer ${layerIndex}`);
    if (layer.length === 0) {
      lines.push("  - []");
      return;
    }
    layer.forEach((row, rowIndex) => {
      lines.push(`${rowIndex === 0 ? "  - " : "    "}- ${flow(row)}`);
    });
  });
  return lines;
}

/**
 * raw ドキュメントと definition の対応づけを `keymap.yaml` へ書き出す。
 *
 * 出力は `VilDocument` の全 field を含む。`parseKeymapYaml` と往復して等価になることが
 * この関数の契約で、`.vil` の意味 round-trip（ADR 0001）と合成できる。
 *
 * `# layer N` などの comment は読み手のための注記で、parse では捨てる。
 * 注記に意味を持たせると `keymap.yaml` が第 2 の状態になるため、往復の対象にしない。
 *
 * @doc docs/specs/keymap-yaml.md#serializekeymapyaml
 */
export function serializeKeymapYaml(document: VilDocument, binding: DefinitionBinding): string {
  const opaque: OpaqueFields = {
    macro: document.macro,
    key_override: document.keyOverride,
    alt_repeat_key: document.altRepeatKey,
    unknown: document.raw.unknown,
  };

  const lines: string[] = [
    `schema: ${KEYMAP_YAML_SCHEMA}`,
    "keyboard:",
    `  uid: ${scalar(binding.keyboardUid)}`,
    `  name: ${scalar(binding.keyboardName)}`,
    "definition:",
    `  path: ${scalar(binding.definitionPath)}`,
    `  digest: ${scalar(binding.definitionDigest)}`,
    "vial:",
    `  version: ${document.version}`,
    `  vialProtocol: ${document.vialProtocol}`,
    `  viaProtocol: ${document.viaProtocol}`,
    `  layoutOptions: ${document.layoutOptions}`,
    ...emitLayers("layers", document.layout),
    ...emitLayers("encoders", document.encoderLayout),
    "tapDance:",
    ...document.tapDance.map((entry) => `  - ${flow(entry)}`),
    "combo:",
    ...document.combo.map((entry) => `  - ${flow(entry)}`),
    "settings:",
    ...Object.entries(document.settings).map(([qsid, value]) => `  ${scalar(qsid)}: ${value}`),
    "raw:",
    `  keyOrder: ${flow(document.raw.keyOrder)}`,
    "  json: |",
    ...JSON.stringify(opaque, null, 2)
      .split("\n")
      .map((line) => `    ${line}`),
  ];

  return lines.join("\n") + "\n";
}
