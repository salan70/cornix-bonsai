#!/usr/bin/env node
/**
 * `just ui` が起動するローカルサーバー。
 *
 * Web UI の配布は GitHub Pages ではなく、clone したリポジトリからのこの起動だけにする
 * （ADR 0033）。画面と Node 側の処理が同じ checkout から作られるので、版がずれない。
 */

import { execFile } from "node:child_process";
import { webcrypto } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createKarabinerCli, defaultKarabinerConfigPath } from "../karabiner/node.ts";
import { detectBuiltInLayout } from "../mac/keyboard-type.ts";
import { defaultMacWorkspaceRoot } from "../workspace/default-root.ts";
import { rejectApiRequest } from "./guard.ts";
import { createMacApi } from "./mac-api.ts";
import { serveStatic } from "./static.ts";

/**
 * 固定の port。origin に port が入るため、変わると workspace の権限とテーマの保存が
 * 起動のたびに消える（ADR 0033）。
 */
export const UI_PORT = 5178;

/** loopback だけに bind する。LAN からは届かない。 */
export const UI_HOST = "127.0.0.1";

/** 利用者が開く URL。origin の比較にも使う。 */
export const UI_ORIGIN = `http://${UI_HOST}:${UI_PORT}`;

/** `src/server/` から 2 つ上が repository root。 */
const DIST = resolve(import.meta.dirname, "..", "..", "dist");

/** API の本文の上限。適用 API が受けるのは配列名・digest・fingerprint だけ。 */
const MAX_BODY = 16 * 1024;

/** path と JSON 本文を受けて応答を返す API。知らない path には `undefined` を返す。 */
export type ApiHandler = (
  path: string,
  body: unknown,
) => Promise<{ readonly kind: string } | undefined>;

/**
 * サーバーを作る。listen は呼び出し側が行う。
 *
 * `/api/` 配下は `rejectApiRequest` を通ったものだけを `api` へ渡す。それ以外は
 * `dist/` の静的配信で、`GET` と `HEAD` だけを受ける。
 *
 * @doc docs/specs/local-server.md#createuiserver
 */
export function createUiServer(
  options: { readonly dist?: string; readonly api?: ApiHandler; readonly origin?: string } = {},
): Server {
  const dist = options.dist ?? DIST;
  const origin = options.origin ?? UI_ORIGIN;
  return createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    if (path.startsWith("/api/")) {
      void handleApi(request, response, path, origin, options.api);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      response.end("method not allowed");
      return;
    }
    void serveStatic(dist, request.url ?? "/").then((result) => {
      response.writeHead(result.status, result.headers);
      response.end(request.method === "HEAD" ? undefined : result.body);
    });
  });
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  origin: string,
  api: ApiHandler | undefined,
): Promise<void> {
  const reason = rejectApiRequest(request, origin);
  if (reason !== undefined) {
    send(response, 403, { kind: "rejected", reason });
    request.resume();
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(await readBody(request));
  } catch (error) {
    send(response, 400, {
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const result = api === undefined ? undefined : await api(path, body);
  if (result === undefined) {
    send(response, 404, { kind: "failed", message: `未知の API: ${path}` });
    return;
  }
  send(response, result.kind === "failed" ? 500 : 200, result);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY) throw new Error("本文が大きすぎる");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function main(): Promise<void> {
  const root = defaultMacWorkspaceRoot();
  const server = createUiServer({
    api: createMacApi({
      root,
      karabiner: defaultKarabinerConfigPath(),
      cli: createKarabinerCli(),
      detectLayout: detectBuiltInLayout,
      crypto: webcrypto,
    }),
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `cornix ui: port ${UI_PORT} は使用中。すでに起動していれば ${UI_ORIGIN}/ を開く`,
      );
    } else {
      console.error(`cornix ui: ${error.message}`);
    }
    process.exit(1);
  });
  server.listen(UI_PORT, UI_HOST, () => {
    console.log(`cornix ui: ${UI_ORIGIN}/ で起動した（Ctrl+C で終了）`);
    console.log(`cornix ui: Mac の適用は ${root} の設定を読む`);
    // 対象ブラウザは Chromium 系だけ（ADR 0004）。既定ブラウザが Safari でも Chrome で開く。
    // 開けなければ URL の表示だけで済ませる。
    execFile("/usr/bin/open", ["-a", "Google Chrome", `${UI_ORIGIN}/`], () => undefined);
  });
}

if (import.meta.main) await main();
