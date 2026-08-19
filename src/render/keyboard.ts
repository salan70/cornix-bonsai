import { keyCenter, toPhysicalLayout } from "../core/definition/parse.ts";
import type { KeyboardDefinition, PhysicalKey } from "../core/definition/types.ts";
import { readKeycode } from "../core/model/keymap-view.ts";
import type { VilDocument } from "../core/vil/types.ts";
import { layerLabel, type WorkspaceLabels } from "../workspace/labels.ts";

export interface RenderOptions {
  readonly layer?: number;
  readonly labels?: WorkspaceLabels;
  readonly title?: string;
}

export interface RenderedKey {
  readonly physical: PhysicalKey;
  readonly keycode: string;
  readonly label: string;
}

export function renderedKeys(
  document: VilDocument,
  definition: KeyboardDefinition,
  options: RenderOptions = {},
): readonly RenderedKey[] {
  const layer = options.layer ?? 0;
  return toPhysicalLayout(definition).keys.flatMap((physical) => {
    const keycode = readKeycode(document, { layer, row: physical.row, col: physical.col });
    return keycode === undefined ? [] : [{ physical, keycode, label: keycode }];
  });
}

/** @doc docs/specs/workspace-cli.md#rendering */
export function renderSvg(
  document: VilDocument,
  definition: KeyboardDefinition,
  options: RenderOptions = {},
): string {
  const layer = options.layer ?? 0;
  const layout = toPhysicalLayout(definition);
  const keys = renderedKeys(document, definition, options);
  const maxX = Math.max(24, ...layout.keys.map((key) => keyCenter(key)[0] + key.width / 2));
  const maxY = Math.max(6, ...layout.keys.map((key) => keyCenter(key)[1] + key.height / 2));
  const title =
    options.title ??
    `${definition.name} / ${layerLabel(options.labels ?? { layers: new Map() }, layer)}`;
  const body = keys.map((entry) => svgKey(entry.physical, entry.label)).join("\n");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX + 1} ${maxY + 1}" role="img" aria-label="${escapeXml(title)}">`,
    `<title>${escapeXml(title)}</title>`,
    `<rect width="100%" height="100%" fill="#f4f5f3"/>`,
    body,
    `</svg>`,
  ].join("\n");
}

/** PDF は外部依存を増やさず、SVGと同じKLE座標から1ページを作る。 */
/** @doc docs/specs/workspace-cli.md#rendering */
export function renderPdf(
  document: VilDocument,
  definition: KeyboardDefinition,
  options: RenderOptions = {},
): Uint8Array {
  const layer = options.layer ?? 0;
  const keys = renderedKeys(document, definition, options);
  const commands = [
    "q",
    "0.96 0.97 0.95 rg 0 0 800 600 re f",
    ...keys.flatMap((entry) => pdfKey(entry.physical, entry.label)),
    "Q",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`,
  ];
  let output = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++)
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

function svgKey(key: PhysicalKey, label: string): string {
  const x = key.x;
  const y = key.y;
  const transform =
    key.rotationAngle === 0
      ? ""
      : ` transform="rotate(${key.rotationAngle} ${key.rotationX} ${key.rotationY})"`;
  return `<g${transform}><rect x="${x}" y="${y}" width="${key.width}" height="${key.height}" rx="0.12" fill="#ffffff" stroke="#69746c"/><text x="${x + key.width / 2}" y="${y + key.height / 2 + 0.12}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui" font-size="0.28">${escapeXml(label)}</text></g>`;
}

function pdfKey(key: PhysicalKey, label: string): readonly string[] {
  const x = key.x * 30 + 20;
  const y = 560 - (key.y + key.height) * 30;
  const width = key.width * 30;
  const height = key.height * 30;
  return [
    "0.41 0.45 0.42 RG 1 w",
    `${x} ${y} ${width} ${height} re S`,
    "BT /F1 8 Tf 0.1 0.12 0.1 rg",
    `${x + 3} ${y + height / 2} Td (${escapePdf(label)}) Tj ET`,
  ];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapePdf(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^\x20-\x7e]/g, "?");
}
