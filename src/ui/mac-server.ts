/**
 * ローカルサーバーの Mac 適用 API を呼ぶ。
 *
 * Web UI は `karabiner.json` にも `karabiner_cli` にも触れない。書き込みと profile の選択は
 * サーバーが行い、ここは同じ origin へ JSON を POST するだけである（ADR 0034）。
 * サーバーへ届かないときは `unreachable` を返し、例外を外へ出さない。
 */

import {
  MAC_API,
  type MacApplyRequest,
  type MacApplyResponse,
  type MacPlanRequest,
  type MacPlanResponse,
  type MacSelectResponse,
  type MacStatusResponse,
} from "../server/protocol.ts";
import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";

/** サーバーへ届かなかった。`just ui` と `just dev` 以外（静的配信だけのサーバーなど）で開いたときもこれになる。 */
export interface MacServerUnreachable {
  readonly kind: "unreachable";
}

export type Reached<T> = T | MacServerUnreachable;

/** `fetch` の差し替え口。テストで偽物を渡す。 */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** @doc docs/specs/ui.md#mac-apply */
export async function fetchMacStatus(
  fetcher: Fetch = fetch,
): Promise<Reached<MacStatusResponse | { readonly kind: "failed" | "rejected" }>> {
  return await post(fetcher, MAC_API.status, {});
}

export async function planMacApplyRemote(
  request: MacPlanRequest,
  fetcher: Fetch = fetch,
): Promise<Reached<MacPlanResponse>> {
  return await post(fetcher, MAC_API.plan, request);
}

export async function applyMacRemote(
  request: MacApplyRequest,
  fetcher: Fetch = fetch,
): Promise<Reached<MacApplyResponse>> {
  return await post(fetcher, MAC_API.apply, request);
}

export async function selectMacProfileRemote(
  layout: MacKeyboardLayout,
  fetcher: Fetch = fetch,
): Promise<Reached<MacSelectResponse>> {
  return await post(fetcher, MAC_API.select, { layout });
}

/** 同じ origin の API へ JSON を POST する。届かなければ `unreachable` を返し、例外を外へ出さない。 */
export async function post<T>(fetcher: Fetch, path: string, body: unknown): Promise<Reached<T>> {
  let response: Response;
  try {
    response = await fetcher(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "unreachable" };
  }
  // 静的配信しか無いサーバーは JSON を返さない。
  if (!(response.headers.get("content-type") ?? "").startsWith("application/json")) {
    return { kind: "unreachable" };
  }
  try {
    return (await response.json()) as T;
  } catch {
    return { kind: "unreachable" };
  }
}
