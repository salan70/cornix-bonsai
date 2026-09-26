/**
 * 既定の workspace を決める。
 *
 * desired state は Cornix LP も Mac もこの repository 自身が持つ（ADR 0028、ADR 0038）。
 * 「どこに置くか」が決まっていないこと自体が運用の負担だったため、repository を唯一の
 * 置き場所に固定する。CLI の全サブコマンドとローカルサーバーが同じ規則を使う。
 */

import { resolve } from "node:path";

/** 既定 workspace を上書きする環境変数。別の場所で試すための逃げ道。改名前の `CORNIX_WORKSPACE` は読まない（ADR 0036）。 */
export const WORKSPACE_ENV = "KEYSYNC_WORKSPACE";

/**
 * `--workspace` が無いときの workspace。
 *
 * 優先順は `$KEYSYNC_WORKSPACE` > repository root。**cwd へは倒さない。** いま
 * `just keysync` が repository root で走るのは justfile の副作用であり、これに依存すると
 * 「どこを見ているか分からない」という元の問題がそのまま残る。
 *
 * 既定が暗黙に効くので、`mac` の各サブコマンドは出力へ、Web UI は header へ解決済みの
 * `workspace` を必ず出す。
 *
 * @doc docs/specs/workspace-cli.md#defaultworkspaceroot
 */
export function defaultWorkspaceRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = env[WORKSPACE_ENV];
  if (override !== undefined && override !== "") return resolve(override);
  // src/workspace/ から 2 つ上が repository root。
  return resolve(import.meta.dirname, "..", "..");
}
