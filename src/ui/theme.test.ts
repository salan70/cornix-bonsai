import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_SCHEME,
  SCHEMES,
  SCHEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyAppearance,
  applyTheme,
  loadSchemeChoice,
  loadThemePreference,
  parseSchemeChoice,
  parseThemePreference,
  resolveTheme,
  saveSchemeChoice,
  saveThemePreference,
} from "./theme.ts";

const TOKEN_PATH = fileURLToPath(new URL("styles/tokens/color.css", import.meta.url));
const SCHEME_PATH = fileURLToPath(new URL("styles/tokens/schemes/", import.meta.url));
const TEST_PATH = fileURLToPath(import.meta.url);
const UI_PATH = fileURLToPath(new URL(".", import.meta.url));

const REQUIRED_SCHEME_TOKENS = [
  "--color-primary",
  "--color-on-primary",
  "--color-primary-text",
  "--color-primary-container",
  "--color-on-primary-container",
  "--color-secondary",
  "--color-on-secondary",
  "--color-secondary-container",
  "--color-on-secondary-container",
  "--color-tertiary",
  "--color-on-tertiary",
  "--color-tertiary-container",
  "--color-on-tertiary-container",
  "--color-background",
  "--color-surface",
  "--color-on-surface",
  "--color-surface-container",
  "--color-surface-variant",
  "--color-on-surface-variant",
  "--color-outline",
  "--color-focus",
  "--color-success",
  "--color-warning",
  "--color-error",
] as const;

test("10配色がlight / darkのsemantic roleを定義する", () => {
  strictEqual(SCHEMES.length, 10);
  for (const scheme of SCHEMES) {
    const css = readFileSync(join(SCHEME_PATH, `${scheme.id}.css`), "utf8");
    for (const theme of ["light", "dark"] as const) {
      const tokens = schemeTokens(css, scheme.id, theme);
      for (const name of REQUIRED_SCHEME_TOKENS)
        ok(tokens.has(name), `${scheme.id}/${theme}: ${name}`);
      strictEqual(tokens.get("--color-surface")?.startsWith("#"), true);
    }
  }
});

test("配色roleの主要状態は読みやすいコントラストを持つ", () => {
  for (const scheme of SCHEMES) {
    const css = readFileSync(join(SCHEME_PATH, `${scheme.id}.css`), "utf8");
    for (const theme of ["light", "dark"] as const) {
      const tokens = schemeTokens(css, scheme.id, theme);
      assertContrast(
        tokens,
        "--color-on-surface",
        "--color-background",
        4.5,
        `${scheme.id}/${theme} 本文`,
      );
      assertContrast(
        tokens,
        "--color-on-primary",
        "--color-primary",
        4.5,
        `${scheme.id}/${theme} primary`,
      );
      assertContrast(
        tokens,
        "--color-on-secondary",
        "--color-secondary",
        4.5,
        `${scheme.id}/${theme} secondary`,
      );
      assertContrast(
        tokens,
        "--color-on-surface-variant",
        "--color-surface-variant",
        3,
        `${scheme.id}/${theme} muted`,
      );
    }
  }
});

test("raw hexはtoken定義元以外へ置かない", () => {
  const allowed = new Set([TOKEN_PATH, ...schemeFiles(), TEST_PATH]);
  const offenders = uiFiles(UI_PATH)
    .filter((path) => !allowed.has(path))
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

test("10配色の保存・不正値フォールバックを確認する", () => {
  strictEqual(parseSchemeChoice(undefined), DEFAULT_SCHEME);
  strictEqual(parseSchemeChoice(null), DEFAULT_SCHEME);
  strictEqual(parseSchemeChoice("unexpected"), DEFAULT_SCHEME);
  const values = new Map<string, string>([[SCHEME_STORAGE_KEY, "kingyo"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  strictEqual(loadSchemeChoice(storage), "kingyo");
  saveSchemeChoice(storage, "tsukiyo");
  strictEqual(loadSchemeChoice(storage), "tsukiyo");
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

test("実効themeとschemeをdocument rootへ反映する", () => {
  const root = { dataset: {} as DOMStringMap };
  strictEqual(applyAppearance(root, "system", "kingyo", true), "dark");
  deepStrictEqual(root.dataset, { theme: "dark", scheme: "kingyo" });
  strictEqual(applyAppearance(root, "light", "fuji", true), "light");
  deepStrictEqual(root.dataset, { theme: "light", scheme: "fuji" });
});

test("旧applyThemeはdefault schemeを付与する", () => {
  const root = { dataset: {} as DOMStringMap };
  strictEqual(applyTheme(root, "system", true), "dark");
  deepStrictEqual(root.dataset, { theme: "dark", scheme: DEFAULT_SCHEME });
});

test("Storage例外が発生しても現在の選択を妨げない", () => {
  const failingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  strictEqual(loadThemePreference(failingStorage), "system");
  strictEqual(loadSchemeChoice(failingStorage), DEFAULT_SCHEME);
  saveThemePreference(failingStorage, "dark");
  saveSchemeChoice(failingStorage, "ume");
});

function schemeTokens(css: string, scheme: string, theme: "light" | "dark"): Map<string, string> {
  const block = css.match(
    new RegExp(
      `:root\\[data-scheme="${scheme}"\\]\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
    ),
  )?.[1];
  ok(block !== undefined, `${scheme}/${theme} token blockが必要`);
  return declarations(block);
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

function resolveHex(tokens: ReadonlyMap<string, string>, name: string): string {
  const value = tokens.get(name);
  ok(value !== undefined, `${name}が必要`);
  ok(/^#[0-9a-f]{6}$/i.test(value), `${name}はhexである必要がある: ${value}`);
  return value.toLowerCase();
}

function contrast(first: string, second: string): number {
  const ordered = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (ordered[0]! + 0.05) / (ordered[1]! + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function schemeFiles(): readonly string[] {
  return readdirSync(SCHEME_PATH)
    .filter((name) => name.endsWith(".css"))
    .map((name) => join(SCHEME_PATH, name));
}

function uiFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return uiFiles(path);
    return [".css", ".ts", ".tsx"].includes(extname(path)) ? [path] : [];
  });
}
