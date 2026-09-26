/**
 * 既定 workspace の解決。
 *
 * CLI の test からこの既定を踏ませない。踏むと作業ツリーへ `keysync/generated/` を書く。
 * CLI 側は `--workspace <tmpdir>` を渡し続ける。
 */

import { strictEqual } from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { defaultWorkspaceRoot, WORKSPACE_ENV } from "./default-root.ts";

test("既定はリポジトリのroot", () => {
  strictEqual(defaultWorkspaceRoot({}), resolve(import.meta.dirname, "..", ".."));
});

test("KEYSYNC_WORKSPACEがあればそちらを絶対パスで返す", () => {
  strictEqual(defaultWorkspaceRoot({ [WORKSPACE_ENV]: "/tmp/elsewhere" }), "/tmp/elsewhere");
});

test("改名前のCORNIX_WORKSPACEは読まない", () => {
  // 黙って読むと「どこを見ているか分からない」が戻る（ADR 0036）。
  strictEqual(
    defaultWorkspaceRoot({ CORNIX_WORKSPACE: "/tmp/elsewhere" }),
    resolve(import.meta.dirname, "..", ".."),
  );
});

test("空のKEYSYNC_WORKSPACEは無視する", () => {
  strictEqual(
    defaultWorkspaceRoot({ [WORKSPACE_ENV]: "" }),
    resolve(import.meta.dirname, "..", ".."),
  );
});
