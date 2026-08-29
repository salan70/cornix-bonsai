import assert from "node:assert/strict";
import test from "node:test";

import { formatBuildTime, parseBuildInfo } from "./build-info.ts";

test("build info accepts a valid SHA and ISO timestamp", () => {
  assert.deepEqual(parseBuildInfo({ commitSha: "2a3f4cd", builtAt: "2026-08-28T15:26:26.000Z" }), {
    commitSha: "2a3f4cd",
    builtAt: "2026-08-28T15:26:26.000Z",
  });
});

test("build info falls back when define is missing or malformed", () => {
  assert.deepEqual(parseBuildInfo(undefined), { commitSha: "dev", builtAt: undefined });
  assert.deepEqual(parseBuildInfo({ commitSha: "", builtAt: "not-a-date" }), {
    commitSha: "dev",
    builtAt: undefined,
  });
});

test("build time is formatted for the user's locale timezone", () => {
  assert.match(formatBuildTime("2026-08-28T15:26:26.000Z", "Asia/Tokyo"), /2026.*8.*29.*0:26/);
  assert.equal(formatBuildTime(undefined), "時刻不明");
});
