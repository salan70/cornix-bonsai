// WebHID は secure context を要求する。http://localhost は secure context 扱いなので、
// この静的 server 経由で index.html を開けば足りる（file:// では動かない）。
// R-004 の probe.mjs を import するため、公開 root は spikes/ に置く。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const entry = "/r-005-write-failure/index.html";
const port = Number(process.env.PORT ?? 8175);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

createServer(async (req, res) => {
  const pathname = normalize(new URL(req.url, "http://localhost").pathname);
  // `/` で index.html を返すと、document URL が `/` になって
  // `./write-probe.mjs` が `/write-probe.mjs` に解決され 404 になる。
  // 相対 import を成立させるため、実際の path へ redirect する。
  if (pathname === "/" || pathname === "/r-005-write-failure") {
    res.writeHead(302, { location: entry }).end();
    return;
  }
  const path = pathname.replace(/^\/+/, "");
  const file = join(root, path);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () =>
  console.log(`http://localhost:${port}${entry} を Chromium 系 browser で開く`),
);
