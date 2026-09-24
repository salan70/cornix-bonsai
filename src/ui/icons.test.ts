import { deepStrictEqual, match, ok, strictEqual } from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ICON_NAMES, sanitizeIconSvg } from "./icons.ts";

const ICONS_PATH = fileURLToPath(new URL("icons", import.meta.url));
const SETS = ["squircle", "dish"] as const;

function svgOf(set: string, name: string): string {
  return readFileSync(join(ICONS_PATH, set, `${name}.svg`), "utf8");
}

test("2組とも17個の機能アイコンをちょうど持つ", () => {
  const expected = ICON_NAMES.map((name) => `${name}.svg`).sort();
  for (const set of SETS) deepStrictEqual(readdirSync(join(ICONS_PATH, set)).sort(), expected);
});

test("写したSVGは出典を記録し、色をcurrentColorだけで持つ", () => {
  const readme = readFileSync(join(ICONS_PATH, "README.md"), "utf8");
  match(readme, /salan70\/uiux-numa `5215a3c`/);
  match(readme, /直接編集しない/);
  for (const set of SETS) {
    for (const name of ICON_NAMES) {
      const svg = svgOf(set, name);
      match(svg, /viewBox="0 0 24 24"/, `${set}/${name}`);
      match(svg, /currentColor/, `${set}/${name}`);
      deepStrictEqual(svg.match(/#[0-9a-f]{3,8}\b/gi) ?? [], [], `${set}/${name}`);
    }
  }
});

test("凹みありの組だけが天面の淡い面を持つ", () => {
  for (const name of ICON_NAMES) {
    ok(svgOf("dish", name).includes('fill-opacity=".1"'), `dish/${name}`);
    ok(!svgOf("squircle", name).includes("fill-opacity"), `squircle/${name}`);
  }
});

test("埋め込む前にtitle・id・role=imgを外し、形は残す", () => {
  for (const set of SETS) {
    for (const name of ICON_NAMES) {
      const raw = svgOf(set, name);
      const clean = sanitizeIconSvg(raw);
      ok(!/<title/.test(clean), `${set}/${name} に title が残る`);
      ok(!/\sid="/.test(clean), `${set}/${name} に id が残る`);
      ok(!/role="img"/.test(clean), `${set}/${name} に role が残る`);
      strictEqual(clean.match(/<path/g)?.length, raw.match(/<path/g)?.length);
      match(clean, /^<svg [^>]*viewBox="0 0 24 24"/);
    }
  }
});
