/**
 * 既定 workspace の解決。
 *
 * CLI の test からこの既定を踏ませない。踏むと利用者の workspace へ `keysync/generated/` を書く。
 * CLI 側は `--workspace <tmpdir>` を渡し続ける。
 */

import { strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";
import { defaultWorkspaceRoot, WORKSPACE_ENV } from "./default-root.ts";

test("KEYSYNC_WORKSPACEを絶対パスで返す", () => {
  strictEqual(defaultWorkspaceRoot({ [WORKSPACE_ENV]: "/tmp/elsewhere" }), "/tmp/elsewhere");
});

test("未設定ならrepositoryへ倒さず止める", () => {
  // 倒すと、付け忘れたときに設定が Git 管理されない場所へ黙って書かれる（ADR 0039）。
  throws(() => defaultWorkspaceRoot({}), /KEYSYNC_WORKSPACE が未設定/);
});

test("空のKEYSYNC_WORKSPACEも未設定として扱う", () => {
  throws(() => defaultWorkspaceRoot({ [WORKSPACE_ENV]: "" }), /KEYSYNC_WORKSPACE が未設定/);
});

test("改名前のCORNIX_WORKSPACEは読まない", () => {
  // 黙って読むと「どこを見ているか分からない」が戻る（ADR 0036）。
  throws(() => defaultWorkspaceRoot({ CORNIX_WORKSPACE: "/tmp/elsewhere" }));
});
