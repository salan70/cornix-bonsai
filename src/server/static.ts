/**
 * ビルド済みの Web UI（`dist/`）を配信する。
 *
 * 配るのは `vite build` の成果物だけで、ソースツリーは見せない（ADR 0033）。
 * Vite の開発サーバーを日常の起動に使わないのはこのためである。
 */

import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

/** 配信する拡張子と Content-Type。`vite build` が出すものだけを持つ。 */
const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".json", "application/json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

/** 配信の結果。HTTP の書き出しは呼び出し側が行う。 */
export interface StaticResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array | string;
}

/**
 * URL の path を `root` 配下のファイルへ解決して読む。
 *
 * `root` の外を指す path（`..` や符号化した区切り）は 404 にする。`/` は `index.html`。
 * `index.html` は毎回取り直させ、hash 付きの asset は長く cache させる。
 * 起動し直した後の reload で新しい build が必ず見えるようにするためである。
 *
 * @doc docs/specs/local-server.md#servestatic
 */
export async function serveStatic(root: string, urlPath: string): Promise<StaticResponse> {
  const notFound: StaticResponse = {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: "not found",
  };
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  } catch {
    return notFound;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const base = resolve(root);
  const target = resolve(base, relative);
  if (!target.startsWith(`${base}${sep}`)) return notFound;
  const type = CONTENT_TYPES.get(extname(target));
  if (type === undefined) return notFound;
  let body: Uint8Array;
  try {
    body = await readFile(target);
  } catch {
    return notFound;
  }
  const cache = relative === "index.html" ? "no-cache" : "public, max-age=31536000, immutable";
  return { status: 200, headers: { "content-type": type, "cache-control": cache }, body };
}
