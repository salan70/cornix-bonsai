import { strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { rejectApiRequest, type GuardedRequest } from "./guard.ts";

const ORIGIN = "http://127.0.0.1:5178";

function request(
  overrides: Record<string, string | undefined> = {},
  method = "POST",
): GuardedRequest {
  return {
    method,
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:5178",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...overrides,
    },
  };
}

test("同じ origin からの JSON の POST だけを受ける", () => {
  strictEqual(rejectApiRequest(request(), ORIGIN), undefined);
  strictEqual(
    rejectApiRequest(request({ "content-type": "application/json; charset=utf-8" }), ORIGIN),
    undefined,
  );
});

test("POST 以外は受けない", () => {
  strictEqual(typeof rejectApiRequest(request({}, "GET"), ORIGIN), "string");
});

test("form から送れる Content-Type は受けない", () => {
  // text/plain と form は preflight 無しで別サイトから送れる。
  strictEqual(typeof rejectApiRequest(request({ "content-type": "text/plain" }), ORIGIN), "string");
  strictEqual(
    typeof rejectApiRequest(
      request({ "content-type": "application/x-www-form-urlencoded" }),
      ORIGIN,
    ),
    "string",
  );
});

test("Host が違えば受けない（DNS rebinding）", () => {
  strictEqual(typeof rejectApiRequest(request({ host: "evil.example:5178" }), ORIGIN), "string");
  strictEqual(typeof rejectApiRequest(request({ host: "localhost:5178" }), ORIGIN), "string");
});

test("Origin が違う・無いときは受けない（CSRF）", () => {
  strictEqual(
    typeof rejectApiRequest(request({ origin: "https://evil.example" }), ORIGIN),
    "string",
  );
  strictEqual(typeof rejectApiRequest(request({ origin: undefined }), ORIGIN), "string");
});

test("same-origin 以外の Sec-Fetch-Site は受けない", () => {
  strictEqual(
    typeof rejectApiRequest(request({ "sec-fetch-site": "cross-site" }), ORIGIN),
    "string",
  );
  strictEqual(typeof rejectApiRequest(request({ "sec-fetch-site": undefined }), ORIGIN), "string");
});
