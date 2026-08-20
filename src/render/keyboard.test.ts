import { strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseDefinition } from "../core/definition/parse.ts";
import { parseVil } from "../core/vil/parse.ts";
import { renderPdf, renderSvg, renderedKeys } from "./keyboard.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/cornix-lp");
const definition = parseDefinition(
  readFileSync(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
);
const document = parseVil(readFileSync(join(FIXTURES, "baseline.vil"), "utf8"));

const labels = {
  layers: new Map<number, string>(),
  keycodes: new Map([["LCG(KC_Q)", "Switch (App)"]]),
};

test("rendererはraw keycode式の表示名とrawを2段で出力する", () => {
  const keys = renderedKeys(document, definition, { labels });
  strictEqual(
    keys.some((key) => key.keycode === "LCG(KC_Q)" && key.label === "Switch (App)\nLCG(KC_Q)"),
    true,
  );

  const svg = renderSvg(document, definition, { labels });
  strictEqual(svg.includes("Switch (App)"), true);
  strictEqual(svg.includes("LCG(KC_Q)"), true);

  const pdf = new TextDecoder().decode(renderPdf(document, definition, { labels }));
  strictEqual(pdf.includes("Switch \\(App\\)"), true);
  strictEqual(pdf.includes("LCG\\(KC_Q\\)"), true);
});

test("rendererは表示名が無いkeycodeを従来どおりrawで出す", () => {
  const keys = renderedKeys(document, definition, { labels });
  strictEqual(keys.find((key) => key.keycode === "KC_A")?.label, "KC_A");
});
