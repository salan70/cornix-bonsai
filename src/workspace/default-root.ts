/**
 * 既定の workspace を決める。
 *
 * desired state は利用者の dotfiles などに置き、この repository には置かない（ADR 0039）。
 * 場所は `$KEYSYNC_WORKSPACE` だけで決める。CLI の全サブコマンドとローカルサーバーが
 * 同じ規則を使う。
 */

import { resolve } from "node:path";

/** workspace を指す環境変数。改名前の `CORNIX_WORKSPACE` は読まない（ADR 0036）。 */
export const WORKSPACE_ENV = "KEYSYNC_WORKSPACE";

/**
 * `--workspace` が無いときの workspace。
 *
 * `$KEYSYNC_WORKSPACE` が無ければ例外にする。**repository root にも cwd にも倒さない。**
 * 倒すと、付け忘れたときに設定が Git 管理されない場所へ黙って書かれる。
 *
 * 既定が暗黙に効くので、`mac` の各サブコマンドは出力へ、Web UI は header へ解決済みの
 * `workspace` を必ず出す。
 *
 * @doc docs/specs/workspace-cli.md#defaultworkspaceroot
 */
export function defaultWorkspaceRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = env[WORKSPACE_ENV];
  if (value === undefined || value === "") {
    throw new Error(
      `${WORKSPACE_ENV} が未設定。設定を置くディレクトリ（dotfiles の config/keysync など）を指定する`,
    );
  }
  return resolve(value);
}
