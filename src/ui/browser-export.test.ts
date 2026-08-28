import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strictEqual, match } from "node:assert/strict";
import { test } from "node:test";
import { parseDefinition } from "../core/definition/parse.ts";
import { EMPTY_LABELS } from "../workspace/labels.ts";
import {
  parseBrowserVil,
  renderBrowserPdf,
  renderBrowserSvg,
  serializeBrowserVil,
} from "./browser-export.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/cornix-lp");

test("browser import/export adapterはCoreのround-tripとrendererを使う", () => {
  const document = parseBrowserVil(readFileSync(join(FIXTURES, "baseline.vil"), "utf8"));
  const definition = parseDefinition(
    readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
  );

  strictEqual(parseBrowserVil(serializeBrowserVil(document)).uid, document.uid);
  match(renderBrowserSvg(document, definition, 0, EMPTY_LABELS), /^<svg /);
  strictEqual(
    new TextDecoder().decode(renderBrowserPdf(document, definition, 0, EMPTY_LABELS)).slice(0, 8),
    "%PDF-1.4",
  );
});
