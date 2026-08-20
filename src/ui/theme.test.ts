import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  loadThemePreference,
  parseThemePreference,
  resolveTheme,
  saveThemePreference,
} from "./theme.ts";

const TOKEN_PATH = fileURLToPath(new URL("tokens.css", import.meta.url));
const TEST_PATH = fileURLToPath(import.meta.url);
const UI_PATH = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(TOKEN_PATH, "utf8");

const SAMPLED_PALETTE = Object.freeze({
  "--palette-dark-darkest-charcoal": "#383a3f",
  "--palette-dark-charcoal": "#4c4e53",
  "--palette-dark-medium-charcoal": "#5a5c61",
  "--palette-dark-gray-key": "#868686",
  "--palette-dark-light-gray-key": "#9b9b9b",
  "--palette-dark-yellow": "#de9e04",
  "--palette-dark-yellow-highlight": "#e8a619",
  "--palette-dark-orange": "#f37252",
  "--palette-dark-mint": "#68c2a8",
  "--palette-light-white-key": "#efefef",
  "--palette-light-light-gray": "#c6cbc9",
  "--palette-light-gray": "#9ea19f",
  "--palette-light-yellow": "#fac400",
  "--palette-light-blue": "#4078e0",
  "--palette-light-blue-highlight": "#5883e4",
  "--palette-light-green": "#5cbc55",
});

test("Issue #16の画像由来paletteを補正せずtoken化する", () => {
  const { light } = themeTokens();
  deepStrictEqual(
    Object.fromEntries(Object.keys(SAMPLED_PALETTE).map((name) => [name, light.get(name)])),
    SAMPLED_PALETTE,
  );
  match(css, /Image-sampled colors/);
  match(css, /Derived implementation colors/);
});

test("実効theme属性でLightとDarkのsemantic tokenを切り替える", () => {
  const { light, dark } = themeTokens();
  match(css, /:root\[data-theme="dark"\]/);
  strictEqual(light.get("color-scheme"), "light");
  strictEqual(dark.get("color-scheme"), "dark");
  strictEqual(resolveHex(light, "--bg"), "#efefef");
  strictEqual(resolveHex(light, "--accent"), "#fac400");
  strictEqual(resolveHex(light, "--secondary"), "#4078e0");
  strictEqual(resolveHex(light, "--success"), "#5cbc55");
  strictEqual(resolveHex(dark, "--bg"), "#383a3f");
  strictEqual(resolveHex(dark, "--accent"), "#de9e04");
  strictEqual(resolveHex(dark, "--secondary"), "#f37252");
  strictEqual(resolveHex(dark, "--success"), "#68c2a8");
});

test("文字・主要操作・keycap・focusのコントラストを確保する", () => {
  const { light, dark } = themeTokens();
  for (const [name, tokens] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    assertContrast(tokens, "--text", "--bg", 4.5, `${name}本文`);
    assertContrast(tokens, "--accent-contrast", "--accent", 4.5, `${name} primary`);
    assertContrast(tokens, "--secondary-contrast", "--secondary", 4.5, `${name} secondary`);
    assertContrast(tokens, "--success-contrast", "--success", 4.5, `${name} success`);
    assertContrast(tokens, "--key-text", "--key-bg", 4.5, `${name} keycap`);
    assertContrast(tokens, "--key-muted", "--key-bg", 4.5, `${name} keycap detail`);
    assertContrast(tokens, "--border-strong", "--surface", 3, `${name} control border`);
  }
  assertContrast(light, "--focus", "--key-bg", 3, "Light focus");
  assertContrast(dark, "--focus-outer", "--key-bg", 3, "Dark focus outer ring");
});

test("raw hexはpaletteとderived tokenの定義元以外へ置かない", () => {
  const offenders = uiFiles(UI_PATH)
    .filter((path) => path !== TOKEN_PATH && path !== TEST_PATH)
    .flatMap((path) => {
      const values = readFileSync(path, "utf8").match(/#[0-9a-f]{3,8}\b/gi) ?? [];
      return values.map((value) => `${path}: ${value}`);
    });
  deepStrictEqual(offenders, []);
});

test("テーマ設定は未保存・不正値をsystemへフォールバックする", () => {
  strictEqual(parseThemePreference(undefined), "system");
  strictEqual(parseThemePreference(null), "system");
  strictEqual(parseThemePreference("unexpected"), "system");
  strictEqual(loadThemePreference(undefined), "system");
  strictEqual(
    loadThemePreference({ getItem: () => "unexpected", setItem: () => undefined }),
    "system",
  );
});

test("保存済みのLight / Dark / systemを読み戻せる", () => {
  const values = new Map<string, string>([[THEME_STORAGE_KEY, "dark"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  strictEqual(loadThemePreference(storage), "dark");
  saveThemePreference(storage, "light");
  strictEqual(loadThemePreference(storage), "light");
  saveThemePreference(storage, "system");
  strictEqual(loadThemePreference(storage), "system");
});

test("systemはOS設定に従い、明示テーマはOS設定を上書きする", () => {
  strictEqual(resolveTheme("system", false), "light");
  strictEqual(resolveTheme("system", true), "dark");
  strictEqual(resolveTheme("light", true), "light");
  strictEqual(resolveTheme("dark", false), "dark");
});

test("実効テーマをdocument rootへ反映する", () => {
  const root = { dataset: {} as DOMStringMap };
  strictEqual(applyTheme(root, "system", true), "dark");
  deepStrictEqual(root.dataset, { theme: "dark" });
  strictEqual(applyTheme(root, "light", true), "light");
  deepStrictEqual(root.dataset, { theme: "light" });
});

test("Storage例外が発生しても現在のテーマ選択を妨げない", () => {
  const failingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  strictEqual(loadThemePreference(failingStorage), "system");
  saveThemePreference(failingStorage, "dark");
});

function themeTokens(): {
  readonly light: Map<string, string>;
  readonly dark: Map<string, string>;
} {
  const lightBlock = css.match(/^:root\s*\{([\s\S]*?)\n\}/m)?.[1];
  const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  ok(lightBlock !== undefined, "Light token blockが必要");
  ok(darkBlock !== undefined, "Dark token blockが必要");
  const light = declarations(lightBlock);
  const dark = new Map([...light, ...declarations(darkBlock)]);
  return { light, dark };
}

function declarations(block: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const declaration of block.matchAll(/(?:^|\n)\s*(--[a-z0-9-]+|color-scheme):\s*([^;]+);/g)) {
    const name = declaration[1];
    const value = declaration[2];
    if (name === undefined || value === undefined)
      throw new Error("CSS token declarationが壊れている");
    result.set(name, value.trim());
  }
  return result;
}

function resolveHex(
  tokens: ReadonlyMap<string, string>,
  name: string,
  seen = new Set<string>(),
): string {
  ok(!seen.has(name), `${name}の循環参照`);
  seen.add(name);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`${name}が必要`);
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
  ok(reference !== undefined, `${name}は直接のhexまたはvar参照である必要がある: ${value}`);
  return resolveHex(tokens, reference, seen);
}

function assertContrast(
  tokens: ReadonlyMap<string, string>,
  foreground: string,
  background: string,
  minimum: number,
  label: string,
): void {
  const ratio = contrast(resolveHex(tokens, foreground), resolveHex(tokens, background));
  ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)} < ${minimum}`);
}

function contrast(first: string, second: string): number {
  const ordered = [luminance(first), luminance(second)].sort((left, right) => right - left);
  const lighter = ordered[0]!;
  const darker = ordered[1]!;
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function uiFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return uiFiles(path);
    return [".css", ".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}
