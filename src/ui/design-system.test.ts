import { deepStrictEqual, ok } from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const UI_PATH = fileURLToPath(new URL(".", import.meta.url));
const STYLES_PATH = join(UI_PATH, "styles");
const TOKENS_PATH = join(STYLES_PATH, "tokens");
const COLOR_TOKEN_PATH = join(TOKENS_PATH, "color.css");

/**
 * 幾何由来でtoken化できない宣言に付ける印。宣言と同じ行のコメント内に含む文字列で判定する
 * （盤面・pickerの実行時計算、@mediaのbreakpointなど。docs/specs/design-system.md#幾何由来の例外）。
 */
const GEOMETRY_EXEMPT_MARKER = "geometric";

/** globalなJS/CSSが実行時に注入するcustom propertyで、tokenの定義元を持たない。 */
const RUNTIME_CUSTOM_PROPERTIES = new Set([
  "--cap-font",
  "--cap-sub-font",
  "--fit-scale",
  "--layer-color",
  "--pk",
  "--pk-total",
  "--pk-u",
]);

test("dimension tokenがspace / radius / control-height / z-indexの各段を持つ", () => {
  const css = readFileSync(join(TOKENS_PATH, "dimension.css"), "utf8");
  for (const name of [
    "--space-0",
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-5",
    "--space-6",
    "--space-7",
    "--space-8",
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--radius-full",
    "--control-height-sm",
    "--control-height-md",
    "--control-height-lg",
    "--z-key-selected",
    "--z-related-active",
    "--z-connectors",
    "--z-modal",
  ]) {
    ok(css.includes(`${name}:`), `${name}がdimension.cssに無い`);
  }
});

test("typography tokenがsize 6段とfont familyを持つ", () => {
  const css = readFileSync(join(TOKENS_PATH, "typography.css"), "utf8");
  for (const name of [
    "--font-sans",
    "--font-mono",
    "--text-xs",
    "--text-sm",
    "--text-base",
    "--text-md",
    "--text-lg",
    "--text-xl",
    "--weight-regular",
    "--weight-medium",
    "--weight-semibold",
  ]) {
    ok(css.includes(`${name}:`), `${name}がtypography.cssに無い`);
  }
});

test("motion tokenはprefers-reduced-motionでdurationを0msへ落とす", () => {
  const css = readFileSync(join(TOKENS_PATH, "motion.css"), "utf8");
  ok(css.includes("--duration-fast:"));
  ok(css.includes("--duration-base:"));
  match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("raw hexはstyles/tokens/color.cssにしか無い", () => {
  const offenders = styleFiles()
    .filter((path) => path !== COLOR_TOKEN_PATH)
    .flatMap((path) => {
      const values = readFileSync(path, "utf8").match(/#[0-9a-f]{3,8}\b/gi) ?? [];
      return values.map((value) => `${relative(UI_PATH, path)}: ${value}`);
    });
  deepStrictEqual(offenders, []);
});

test("component / feature層は生のpx・remを直値で持たない（token fileと幾何由来の例外を除く）", () => {
  const offenders = styleFiles()
    .filter((path) => !path.startsWith(TOKENS_PATH))
    .flatMap((path) => {
      const raw = readFileSync(path, "utf8");
      const rawLines = raw.split("\n");
      const codeLines = stripBlockComments(raw).split("\n");
      return codeLines
        .map((code, index) => ({ code, index }))
        .filter(({ index }) => !rawLines[index]!.includes(GEOMETRY_EXEMPT_MARKER))
        .filter(({ code }) => /\d+(\.\d+)?(px|rem)\b/.test(code))
        .map(({ index }) => `${relative(UI_PATH, path)}:${index + 1}: ${rawLines[index]!.trim()}`);
    });
  deepStrictEqual(offenders, []);
});

test("CSSは!importantを使わない", () => {
  const offenders = styleFiles().flatMap((path) => {
    const raw = readFileSync(path, "utf8");
    const rawLines = raw.split("\n");
    const codeLines = stripBlockComments(raw).split("\n");
    return codeLines
      .map((code, index) => ({ code, index }))
      .filter(({ code }) => code.includes("!important"))
      .map(({ index }) => `${relative(UI_PATH, path)}:${index + 1}: ${rawLines[index]!.trim()}`);
  });
  deepStrictEqual(offenders, []);
});

test("component / feature層が参照するtokenはすべて実在する", () => {
  const definedTokens = new Set(
    styleFiles(TOKENS_PATH).flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]!),
    ),
  );
  const offenders = styleFiles()
    .filter((path) => !path.startsWith(TOKENS_PATH))
    .flatMap((path) => {
      const references = [...readFileSync(path, "utf8").matchAll(/var\((--[a-z0-9-]+)/g)].map(
        (match) => match[1]!,
      );
      return references
        .filter((name) => !definedTokens.has(name) && !RUNTIME_CUSTOM_PROPERTIES.has(name))
        .map((name) => `${relative(UI_PATH, path)}: ${name}`);
    });
  deepStrictEqual([...new Set(offenders)], []);
});

test("component / feature層のclass selectorはTSX側かkeycodeClass()の返り値に対応する", () => {
  const sourceText = sourceFiles()
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const offenders = styleFiles()
    .filter((path) => !path.startsWith(TOKENS_PATH))
    .flatMap((path) => {
      const classes = extractClassSelectors(readFileSync(path, "utf8"));
      return classes
        .filter((className) => !sourceText.includes(className))
        .map((className) => `${relative(UI_PATH, path)}: .${className}`);
    });
  deepStrictEqual([...new Set(offenders)], []);
});

function styleFiles(root: string = STYLES_PATH): readonly string[] {
  if (!exists(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return styleFiles(path);
    return extname(path) === ".css" ? [path] : [];
  });
}

function sourceFiles(): readonly string[] {
  return walk(UI_PATH).filter((path) => {
    const ext = extname(path);
    return (ext === ".ts" || ext === ".tsx") && !path.endsWith(".test.ts");
  });
}

function walk(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** コメントを行数が変わらないように空白へ置き換える。行番号がずれないようにするため。 */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

function extractClassSelectors(css: string): readonly string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorsOnly = withoutComments.replace(/\{[^{}]*\}/g, "");
  const matches = [...selectorsOnly.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)];
  return [...new Set(matches.map((match) => match[1]!))];
}

function match(text: string, pattern: RegExp): void {
  ok(pattern.test(text), `${pattern}に一致しない`);
}
