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

const TOKEN_PATH = fileURLToPath(new URL("styles/tokens/color.css", import.meta.url));
const TEST_PATH = fileURLToPath(import.meta.url);
const UI_PATH = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(TOKEN_PATH, "utf8");

/** pop-toy の 24 役割。値は uiux-numa の生成物を写したもので、ここでは名前と対比だけを確かめる。 */
const ROLES = [
  "primary",
  "on-primary",
  "primary-text",
  "primary-container",
  "on-primary-container",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "background",
  "surface",
  "on-surface",
  "surface-container",
  "surface-variant",
  "on-surface-variant",
  "outline",
  "focus",
  "success",
  "warning",
  "error",
] as const;

test("pop-toyの24役割をLightとDarkの両方にhexで持ち、出典commitを記録する", () => {
  const { light, dark } = themeTokens();
  for (const role of ROLES) {
    match(light.get(`--color-${role}`) ?? "", /^#[0-9a-f]{6}$/i, `Light --color-${role}`);
    match(dark.get(`--color-${role}`) ?? "", /^#[0-9a-f]{6}$/i, `Dark --color-${role}`);
  }
  match(css, /salan70\/uiux-numa d2900ee/);
  match(css, /pop-toy\/scheme\.css/);
});

test("明暗はtheme.tsが決めるdata-theme属性で切り替え、media queryに依存しない", () => {
  match(css, /:root,\s*:root\[data-theme="light"\]\s*\{/);
  match(css, /:root\[data-theme="dark"\]\s*\{/);
  ok(
    !css.replace(/\/\*[\s\S]*?\*\//g, "").includes("prefers-color-scheme"),
    "color.cssはprefers-color-schemeを使わない",
  );
  const { light, dark } = themeTokens();
  strictEqual(light.get("color-scheme"), "light");
  strictEqual(dark.get("color-scheme"), "dark");
});

test("本体固有の派生tokenは役割色だけから作り、hexを増やさない", () => {
  const derived = derivedBlock();
  ok(derived.includes("--color-key-mod:"), "keycodeの種類の派生tokenが必要");
  ok(derived.includes("--color-diff-dot:"), "差分の印の派生tokenが必要");
  deepStrictEqual(derived.match(/#[0-9a-f]{3,8}\b/gi) ?? [], []);
  for (const [, value] of declarations(derived)) {
    for (const reference of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      ok(
        ROLES.some((role) => reference[1] === `--color-${role}`),
        `派生tokenが役割色以外を参照している: ${reference[1]}`,
      );
    }
  }
});

test("文字は4.5:1、focusと操作の境界は3:1以上のコントラストを保つ", () => {
  const { light, dark } = themeTokens();
  for (const [name, tokens] of [
    ["Light", light],
    ["Dark", dark],
  ] as const) {
    const text: readonly (readonly [string, string])[] = [
      ["on-surface", "surface"],
      ["on-surface", "background"],
      ["on-surface", "surface-container"],
      ["on-surface-variant", "surface"],
      ["on-surface-variant", "surface-container"],
      ["on-surface-variant", "background"],
      ["primary-text", "surface"],
      ["primary-text", "surface-container"],
      ["on-primary", "primary"],
      ["on-secondary", "secondary"],
      ["on-tertiary", "tertiary"],
      ["on-primary-container", "primary-container"],
      ["on-secondary-container", "secondary-container"],
      ["on-tertiary-container", "tertiary-container"],
      ["on-surface", "surface-variant"],
      ["success", "surface"],
      ["warning", "surface"],
      ["error", "surface"],
      ["success", "surface-container"],
      ["warning", "surface-container"],
      ["error", "surface-container"],
      ["surface", "warning"],
      ["surface", "error"],
      ["surface", "success"],
      ["surface", "on-surface"],
    ];
    for (const [foreground, background] of text)
      assertContrast(tokens, foreground, background, 4.5, `${name} ${foreground} / ${background}`);
    for (const background of ["surface", "background", "surface-container"])
      assertContrast(tokens, "focus", background, 3, `${name} focus / ${background}`);
    assertContrast(tokens, "outline", "surface", 3, `${name} control border`);
    assertContrast(
      tokens,
      "outline",
      "surface-container",
      3,
      `${name} control border on container`,
    );
  }
});

test("Lightの黄の塗りは白の面に3:1未満なので、選択の目印を塗りだけに頼れないことを記録する", () => {
  const { light } = themeTokens();
  ok(contrast(hexOf(light, "primary"), hexOf(light, "surface")) < 3);
});

test("raw hexはcolor.css以外へ置かない", () => {
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
  const lightBlock = css.match(/:root,\s*:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  const darkBlock = css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  ok(lightBlock !== undefined, "Light token blockが必要");
  ok(darkBlock !== undefined, "Dark token blockが必要");
  return { light: declarations(lightBlock), dark: declarations(darkBlock) };
}

function derivedBlock(): string {
  const block = css.match(/\n:root\s*\{([\s\S]*?)\n\}/)?.[1];
  ok(block !== undefined, "派生token blockが必要");
  return block;
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

function hexOf(tokens: ReadonlyMap<string, string>, role: string): string {
  const value = tokens.get(`--color-${role}`);
  ok(value !== undefined && /^#[0-9a-f]{6}$/i.test(value), `--color-${role}はhexである必要がある`);
  return value.toLowerCase();
}

function assertContrast(
  tokens: ReadonlyMap<string, string>,
  foreground: string,
  background: string,
  minimum: number,
  label: string,
): void {
  const ratio = contrast(hexOf(tokens, foreground), hexOf(tokens, background));
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
