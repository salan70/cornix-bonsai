import { deepStrictEqual, match, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LOGO_PART_CLASSES, prepareLogoSvg } from "./logo.ts";

const LOGO = readFileSync(
  fileURLToPath(new URL("icons/logo/keysync.svg", import.meta.url)),
  "utf8",
);
const FAVICON = readFileSync(
  fileURLToPath(new URL("../../public/favicon.svg", import.meta.url)),
  "utf8",
);
const README = readFileSync(fileURLToPath(new URL("icons/README.md", import.meta.url)), "utf8");

const shapesOf = (svg: string): string[] => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]!);

test("写したロゴは出典を記録し、色をcurrentColorだけで持つ", () => {
  match(README, /experiments\/keysync-logo\//);
  match(LOGO, /viewBox="0 0 32 32"/);
  match(LOGO, /currentColor/);
  deepStrictEqual(LOGO.match(/#[0-9a-f]{3,8}\b/gi) ?? [], []);
});

test("埋め込む前にtitleとroleを外し、part-mark-*のidを対応するclassへ置き換える", () => {
  const clean = prepareLogoSvg(LOGO);
  ok(!/<title/.test(clean));
  ok(!/role="img"/.test(clean));
  ok(!/\sid="/.test(clean));
  const ids = [...LOGO.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!).sort();
  deepStrictEqual(ids, Object.keys(LOGO_PART_CLASSES).sort());
  for (const className of Object.values(LOGO_PART_CLASSES)) {
    match(clean, new RegExp(`class="${className}"`));
  }
  deepStrictEqual(shapesOf(clean), shapesOf(LOGO));
});

test("対応の無いpartのidは例外にする", () => {
  throws(() => prepareLogoSvg('<svg><path id="part-mark-new"/></svg>'), /part-mark-new/);
});

test("faviconはロゴと同じ形を持ち、墨だけを明暗で切り替える", () => {
  deepStrictEqual(shapesOf(FAVICON), shapesOf(LOGO));
  strictEqual(FAVICON.match(/transform="rotate\(-15 18 6\.75\)"/g)?.length, 1);
  match(FAVICON, /prefers-color-scheme:\s*dark/);
  ok(!/currentColor/.test(FAVICON));
});
