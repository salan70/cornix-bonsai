import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strictEqual, match } from "node:assert/strict";
import { test } from "node:test";
import { parseDefinition } from "../core/definition/parse.ts";
import { EMPTY_LABELS } from "../workspace/labels.ts";
import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import {
  generateBrowserKarabiner,
  generateBrowserKarabinerFromDocument,
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

test("Karabinerのasset書き出しはerrorがあれば止まる", () => {
  // Browser UIから適用はしない。書き出す前に落とせないと分かった時点で止める（ADR 0022）。
  const broken = generateBrowserKarabiner(
    'schema: keysync/mac-keymap@1\nprofile: "KeySync"\nlayers:\n  0:\n    "a": "TD(0)"\n',
  );
  strictEqual(broken.asset, undefined);
  strictEqual(broken.summary.error, 1);
});

test("Karabinerのassetはlintに渡せる形で返る", () => {
  const text = readFileSync(
    join(import.meta.dirname, "../../fixtures/mac-keyboard/desired.yaml"),
    "utf8",
  );
  const { asset, summary } = generateBrowserKarabiner(text);
  strictEqual(summary.error, 0);
  const parsed = JSON.parse(asset ?? "") as { title: string; rules: unknown[] };
  strictEqual(parsed.title, "KeySync");
  strictEqual(parsed.rules.length, 4);
});

test("in-memory documentからのasset書き出しはtext入力と同じ結果になる", () => {
  const text = readFileSync(
    join(import.meta.dirname, "../../fixtures/mac-keyboard/desired.yaml"),
    "utf8",
  );
  const fromText = generateBrowserKarabiner(text);
  const fromDocument = generateBrowserKarabinerFromDocument(parseMacKeymapYaml(text));
  strictEqual(fromDocument.asset, fromText.asset);
  strictEqual(fromDocument.summary.error, 0);
});
