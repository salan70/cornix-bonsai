import { strictEqual } from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveStatic } from "./static.ts";

async function dist(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cornix-dist-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html>");
  await writeFile(join(root, "assets", "index-abc.js"), "export {}");
  await writeFile(join(root, "..", "secret.html"), "secret").catch(() => undefined);
  return root;
}

test("/ は index.html を毎回取り直させる", async () => {
  const root = await dist();
  const result = await serveStatic(root, "/");
  strictEqual(result.status, 200);
  strictEqual(result.headers["content-type"], "text/html; charset=utf-8");
  strictEqual(result.headers["cache-control"], "no-cache");
});

test("hash 付きの asset は長く cache させる", async () => {
  const root = await dist();
  const result = await serveStatic(root, "/assets/index-abc.js?v=1");
  strictEqual(result.status, 200);
  strictEqual(result.headers["cache-control"], "public, max-age=31536000, immutable");
});

test("root の外を指す path は 404", async () => {
  // ソースツリーや他のファイルを配らない（ADR 0033）。
  const root = await dist();
  strictEqual((await serveStatic(root, "/../secret.html")).status, 404);
  strictEqual((await serveStatic(root, "/%2e%2e/secret.html")).status, 404);
  strictEqual((await serveStatic(root, "/assets/%2e%2e/%2e%2e/secret.html")).status, 404);
});

test("無いファイルと未知の拡張子は 404", async () => {
  const root = await dist();
  strictEqual((await serveStatic(root, "/missing.js")).status, 404);
  await writeFile(join(root, "notes.txt"), "x");
  strictEqual((await serveStatic(root, "/notes.txt")).status, 404);
  strictEqual((await serveStatic(root, "/%E0%A4%A")).status, 404);
});
