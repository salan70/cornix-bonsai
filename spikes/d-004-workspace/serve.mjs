// File System Access API は secure context を要求する。http://localhost は secure context
// 扱いなので、この静的 server 経由で index.html を開けば足りる（file:// では動かない）。
// 公開 root を spikes/ に置いているのは R-004 / R-005 と同じ理由（相対 import のため）。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const entry = "/d-004-workspace/index.html";
const port = Number(process.env.PORT ?? 8177);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

createServer(async (req, res) => {
  const pathname = normalize(new URL(req.url, "http://localhost").pathname);
  if (pathname === "/" || pathname === "/d-004-workspace") {
    res.writeHead(302, { location: entry }).end();
    return;
  }
  const file = join(root, pathname.replace(/^\/+/, ""));
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
