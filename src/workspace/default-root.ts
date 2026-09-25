/**
 * `keysync mac` の既定 workspace を決める。
 *
 * Mac の desired state はこの repository 自身が持つ（ADR 0028）。Cornix LP 向けの
 * workspace は利用者が任意のディレクトリへ置くが、Mac 側は「どこに置くか」が
 * 決まっていないこと自体が運用の負担だった。repository を唯一の置き場所に固定する。
 */

import { resolve } from "node:path";

/** 既定 workspace を上書きする環境変数。別の場所で試すための逃げ道。 */
export const WORKSPACE_ENV = "CORNIX_WORKSPACE";

/**
 * `--workspace` が無いときの `keysync mac` の workspace。
 *
 * 優先順は `$CORNIX_WORKSPACE` > repository root。**cwd へは倒さない。** いま
 * `just keysync` が repository root で走るのは justfile の副作用であり、これに依存すると
 * 「どこを見ているか分からない」という元の問題がそのまま残る。
 *
 * 既定が暗黙に効くので、`mac` の各サブコマンドは出力へ解決済みの `workspace` を必ず載せる。
 *
 * @doc docs/specs/workspace-cli.md#defaultmacworkspaceroot
 */
export function defaultMacWorkspaceRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = env[WORKSPACE_ENV];
  if (override !== undefined && override !== "") return resolve(override);
  // src/workspace/ から 2 つ上が repository root。
  return resolve(import.meta.dirname, "..", "..");
}
