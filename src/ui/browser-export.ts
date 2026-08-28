import type { KeyboardDefinition } from "../core/definition/types.ts";
import { parseVil } from "../core/vil/parse.ts";
import { serializeVil } from "../core/vil/serialize.ts";
import { renderPdf, renderSvg } from "../render/keyboard.ts";
import type { WorkspaceLabels } from "../workspace/labels.ts";
import type { VilDocument } from "../core/vil/types.ts";

/** @doc docs/specs/ui.md#browser-import-export */
export function parseBrowserVil(text: string): VilDocument {
  return parseVil(text);
}

/** @doc docs/specs/ui.md#browser-import-export */
export function serializeBrowserVil(document: VilDocument): string {
  return serializeVil(document);
}

/** @doc docs/specs/ui.md#browser-import-export */
export function renderBrowserSvg(
  document: VilDocument,
  definition: KeyboardDefinition,
  layer: number,
  labels: WorkspaceLabels,
): string {
  return renderSvg(document, definition, {
    layer,
    labels,
    title: `${definition.name} / layer ${layer}`,
  });
}

/** @doc docs/specs/ui.md#browser-import-export */
export function renderBrowserPdf(
  document: VilDocument,
  definition: KeyboardDefinition,
  layer: number,
  labels: WorkspaceLabels,
): Uint8Array {
  return renderPdf(document, definition, {
    layer,
    labels,
    title: `${definition.name} / layer ${layer}`,
  });
}
