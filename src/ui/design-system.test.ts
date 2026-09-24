import { deepStrictEqual, match, ok } from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const UI_PATH = fileURLToPath(new URL(".", import.meta.url));
const STYLES_PATH = join(UI_PATH, "styles");
const TOKENS_PATH = join(STYLES_PATH, "tokens");
const COLOR_TOKEN_PATH = join(TOKENS_PATH, "color.css");
const KEYCODE_LABELS_PATH = join(UI_PATH, "keycode-labels.ts");

/**
 * 幾何由来で token 化できない宣言に付ける印。宣言と同じ行のコメント内に含む文字列で判定する
 * （盤面の点描、@media の breakpoint など。docs/specs/design-system.md#幾何由来の例外）。
 */
const GEOMETRY_EXEMPT_MARKER = "geometric";

/** uiux-numa から写した token と、写した元の family。 */
const VENDORED_TOKENS: Readonly<Record<string, readonly string[]>> = {
  "space.css": ["--space-50", "--space-100", "--space-200", "--space-400", "--space-1000"],
  "radius.css": ["--radius-control", "--radius-surface", "--radius-pill", "--radius-full"],
  "border.css": ["--border-width-thin", "--border-width-thick"],
  "size.css": ["--size-control-height-sm", "--size-control-height-md", "--size-target-min"],
  "typography.css": ["--font-family-sans", "--typography-caption-font-size", "--font-weight-bold"],
  "motion.css": ["--duration-state", "--duration-press", "--easing-standard", "--easing-out"],
};

const LAYERS = ["reset", "tokens", "base", "components", "features", "utilities"] as const;

test("uiux-numaのtokenを出典commit付きで写し、各familyの段を持つ", () => {
  for (const [file, names] of Object.entries(VENDORED_TOKENS)) {
    const css = readFileSync(join(TOKENS_PATH, file), "utf8");
    match(css, /^\/\* 出典: salan70\/uiux-numa d2900ee tokens\//, `${file}に出典が無い`);
    match(css, /直接編集しない/, `${file}に編集禁止の注記が無い`);
    for (const name of names) ok(css.includes(`${name}:`), `${name}が${file}に無い`);
  }
  const fonts = readFileSync(join(TOKENS_PATH, "fonts.css"), "utf8");
  match(fonts, /LINESeedJP-Regular\.woff2/);
  match(fonts, /LINESeedJP-Bold\.woff2/);
  ok(exists(join(TOKENS_PATH, "fonts", "OFL.txt")), "LINE Seed JPのOFL.txtが必要");
});

test("cascade layerの順を宣言し、token以外のCSSはいずれかのlayerに入る", () => {
  const index = readFileSync(join(STYLES_PATH, "index.css"), "utf8");
  ok(index.startsWith(`@layer ${LAYERS.join(", ")};`), "index.cssの先頭にlayerの順が必要");
  for (const path of styleFiles().filter((file) => !file.startsWith(TOKENS_PATH))) {
    if (path === join(STYLES_PATH, "index.css")) continue;
    const css = readFileSync(path, "utf8");
    const layer = css.match(/@layer ([a-z]+) \{/)?.[1];
    ok(
      layer !== undefined && (LAYERS as readonly string[]).includes(layer),
      `${relative(UI_PATH, path)}がcascade layerに入っていない`,
    );
  }
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

test("token以外のCSSは生のpx・remを直値で持たない（幾何由来の例外を除く）", () => {
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

test("CSSとTSXが参照するcustom propertyはすべてCSSで定義されるかTSXが実行時に与える", () => {
  const defined = new Set(
    styleFiles().flatMap((path) =>
      [...stripBlockComments(readFileSync(path, "utf8")).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
        (found) => found[1]!,
      ),
    ),
  );
  const source = sourceText();
  const runtime = new Set([...source.matchAll(/"(--[a-z0-9-]+)"/g)].map((found) => found[1]!));
  const referenced = [
    ...styleFiles().map((path) => ({
      path,
      text: stripBlockComments(readFileSync(path, "utf8")),
    })),
    ...sourceFiles().map((path) => ({ path, text: readFileSync(path, "utf8") })),
  ].flatMap(({ path, text }) =>
    [...text.matchAll(/var\((--[a-z0-9-]+)/g)].map((found) => ({ path, name: found[1]! })),
  );
  const offenders = referenced
    .filter(({ name }) => !defined.has(name) && !runtime.has(name))
    .map(({ path, name }) => `${relative(UI_PATH, path)}: ${name}`);
  deepStrictEqual([...new Set(offenders)], []);
});

test("CSSのclass selectorはTSXのclass名か、keycodeClass()の値から作るkind-*に対応する", () => {
  const source = sourceText();
  const kinds = keycodeClassValues();
  ok(kinds.length > 0, "keycodeClass()の返り値を読めない");
  const offenders = styleFiles()
    .filter((path) => !path.startsWith(TOKENS_PATH))
    .flatMap((path) =>
      extractClassSelectors(readFileSync(path, "utf8"))
        .filter((className) => {
          if (className.startsWith("kind-") && kinds.includes(className.slice("kind-".length)))
            return false;
          return !new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(className)}($|[^A-Za-z0-9_-])`).test(
            source,
          );
        })
        .map((className) => `${relative(UI_PATH, path)}: .${className}`),
    );
  deepStrictEqual([...new Set(offenders)], []);
});

test("reduced motionではすべての動きを止める", () => {
  const utilities = stripBlockComments(readFileSync(join(STYLES_PATH, "utilities.css"), "utf8"));
  const block = utilities.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}/)?.[1];
  ok(block !== undefined, "utilities.cssにreduced motionの規則が必要");
  match(block, /\*,\s*\*::before,\s*\*::after/);
  match(block, /transition: none;/);
  match(block, /animation: none;/);
  const button = readFileSync(join(STYLES_PATH, "components", "button.css"), "utf8");
  match(button, /prefers-reduced-motion: reduce/, "Buttonのhoverの拡大もreduced motionで止める");
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

function sourceText(): string {
  return sourceFiles()
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

/** `keycodeClass()`の本体から返り値の文字列を読む。 */
function keycodeClassValues(): readonly string[] {
  const text = readFileSync(KEYCODE_LABELS_PATH, "utf8");
  const start = text.indexOf("export function keycodeClass");
  const body = text.slice(start, text.indexOf("\n}\n", start));
  return [...body.matchAll(/(?:return|\?|:) "([a-z-]+)"/g)].map((found) => found[1]!);
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
  return text.replace(/\/\*[\s\S]*?\*\//g, (found) => found.replace(/[^\n]/g, " "));
}

function extractClassSelectors(css: string): readonly string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorsOnly = withoutComments.replace(/\{[^{}]*\}/g, "");
  const found = [...selectorsOnly.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)];
  return [...new Set(found.map((item) => item[1]!))];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
