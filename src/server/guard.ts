/**
 * ローカルサーバーの API へのリクエストを、ヘッダーだけで受けるか決める。
 *
 * 守る相手はブラウザで開いている別のサイトである（ADR 0034）。
 *
 * - **CSRF**: 別のサイトからの `fetch` / form 送信は `Origin` と `Sec-Fetch-Site` で弾く
 * - **DNS rebinding**: 攻撃者のドメインを `127.0.0.1` へ向けても、`Host` が一致しない
 *
 * 同じマシンで同じユーザーとして動く別のプロセスは対象外にする。そのプロセスは
 * `karabiner.json` を直接書けるので、API を守っても防げない。起動ごとのトークンを
 * 持たないのはこのためである。対象ブラウザは Chromium 系だけなので（ADR 0004）、
 * `Sec-Fetch-Site` を必ず付けてくる前提に立てる。
 */

/** 判定に使うヘッダー。Node の `IncomingHttpHeaders` の部分集合。 */
export interface GuardedRequest {
  readonly method?: string | undefined;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
}

/**
 * 拒否する理由を返す。受けてよければ `undefined`。
 *
 * `origin` は `http://127.0.0.1:5178` の形。`Host` はその authority と比べる。
 *
 * @doc docs/specs/local-server.md#rejectapirequest
 */
export function rejectApiRequest(request: GuardedRequest, origin: string): string | undefined {
  if (request.method !== "POST") return "POST だけを受ける";
  const type = header(request, "content-type");
  if (type === undefined || type.split(";")[0]?.trim() !== "application/json") {
    return "Content-Type は application/json だけを受ける";
  }
  if (header(request, "host") !== new URL(origin).host) return "Host が一致しない";
  if (header(request, "origin") !== origin) return "Origin が一致しない";
  if (header(request, "sec-fetch-site") !== "same-origin") return "same-origin 以外からは受けない";
  return undefined;
}

function header(request: GuardedRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
