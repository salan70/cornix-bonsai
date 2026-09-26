/**
 * サーバー経由の workspace store の検証。`fetch` の偽物で API を直接呼ぶ。
 */

import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createWorkspaceApi } from "../server/workspace-api.ts";
import type { Fetch } from "./mac-server.ts";
import { openServerWorkspace } from "./server-workspace.ts";

async function serverFetch(): Promise<{ readonly root: string; readonly fetcher: Fetch }> {
  const root = await mkdtemp(join(tmpdir(), "keysync-server-workspace-"));
  const api = createWorkspaceApi({ root });
  const fetcher: Fetch = async (input, init) => {
    const result = await api(input, JSON.parse(String(init.body)));
    return new Response(JSON.stringify(result), {
      status: result?.kind === "failed" ? 500 : 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { root, fetcher };
}

test("サーバーの workspace を開き、テキストとバイト列を往復できる", async () => {
  const { root, fetcher } = await serverFetch();
  const opened = await openServerWorkspace(fetcher);
  if (opened.kind !== "opened") throw new Error(opened.kind);
  strictEqual(opened.store.root, root);

  await opened.store.writeText("keymap.yaml", "日本語\n");
  strictEqual(await readFile(join(root, "keymap.yaml"), "utf8"), "日本語\n");
  strictEqual(await opened.store.readText("keymap.yaml"), "日本語\n");

  const bytes = new Uint8Array(70000).map((_, index) => index % 256);
  await opened.store.writeBytes("keysync/generated/a.pdf", bytes);
  deepStrictEqual(await opened.store.readBytes("keysync/generated/a.pdf"), bytes);
  strictEqual(await opened.store.readText("keysync/labels.yaml"), undefined);
  strictEqual(await opened.store.stat("keysync/labels.yaml"), undefined);
  strictEqual(typeof (await opened.store.stat("keymap.yaml"))?.contentHash, "string");
});

test("サーバーが拒否した path は理由付きの例外になる", async () => {
  const { fetcher } = await serverFetch();
  const opened = await openServerWorkspace(fetcher);
  if (opened.kind !== "opened") throw new Error(opened.kind);
  await rejects(opened.store.writeText("justfile", "x"), /配置の外/);
});

test("サーバーへ届かなければ unreachable を返す", async () => {
  const opened = await openServerWorkspace(() => Promise.reject(new TypeError("offline")));
  deepStrictEqual(opened, { kind: "unreachable" });
});
