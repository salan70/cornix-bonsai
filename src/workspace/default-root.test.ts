/**
 * 既定 workspace の解決。
 *
 * CLI の test からこの既定を踏ませない。踏むと作業ツリーへ `cornix/generated/` を書く。
 * CLI 側は `--workspace <tmpdir>` を渡し続ける。
 */

import { strictEqual } from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { defaultMacWorkspaceRoot, WORKSPACE_ENV } from "./default-root.ts";

test("既定はリポジトリのroot", () => {
  strictEqual(defaultMacWorkspaceRoot({}), resolve(import.meta.dirname, "..", ".."));
});

test("CORNIX_WORKSPACEがあればそちらを絶対パスで返す", () => {
  strictEqual(defaultMacWorkspaceRoot({ [WORKSPACE_ENV]: "/tmp/elsewhere" }), "/tmp/elsewhere");
});

test("空のCORNIX_WORKSPACEは無視する", () => {
  strictEqual(
    defaultMacWorkspaceRoot({ [WORKSPACE_ENV]: "" }),
    resolve(import.meta.dirname, "..", ".."),
  );
});
