/**
 * `mac-keyboard.yaml` の workspace 読み込み状態。
 *
 * Vial 側と違い、Mac の設定は workspace の必須ファイルではない。無い・壊れているの
 * どちらでも workspace 全体（Vial 編集）を止めず、Mac タブだけを対応する状態に
 * 落とすための判別 union をここで組み立てる（ADR 0025）。React に依存しない。
 */

import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import { serializeMacKeymapYaml } from "../core/mac-keymap/serialize.ts";
import {
  CORNIX_PROFILE_NAME,
  DEFAULT_MAC_LAYOUT,
  type MacKeymapDocument,
} from "../core/mac-keymap/types.ts";
import { WORKSPACE_LAYOUT } from "../workspace/layout.ts";
import type { WorkspaceConflictToken, WorkspaceFileStore } from "../workspace/types.ts";

/** Mac タブが取りうる状態。`missing` は作成導線、`error` は理由の表示へ落とす。 */
export type MacWorkspaceState =
  | {
      readonly kind: "ready";
      readonly document: MacKeymapDocument;
      readonly token: WorkspaceConflictToken | undefined;
    }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly reason: string };

/**
 * `mac-keyboard.yaml` を読み、Mac タブの状態へ畳む。
 *
 * parse 失敗は `error` に閉じ込め、例外を外へ出さない。Mac の不調で workspace 全体を
 * `unresolved` にしないため（ADR 0025）。
 *
 * @doc docs/specs/ui.md#mac-tab
 */
export async function probeMacKeymap(
  store: Pick<WorkspaceFileStore, "readText" | "stat">,
): Promise<MacWorkspaceState> {
  try {
    const text = await store.readText(WORKSPACE_LAYOUT.macKeymap);
    if (text === undefined) return { kind: "missing" };
    return {
      kind: "ready",
      document: parseMacKeymapYaml(text),
      token: (await store.stat(WORKSPACE_LAYOUT.macKeymap)) ?? undefined,
    };
  } catch (error) {
    return { kind: "error", reason: error instanceof Error ? error.message : String(error) };
  }
}

/** 作成導線が書く初期状態。既定 layout と空の layer 0 だけを持つ。 */
export function initialMacKeymapYaml(): string {
  const document: MacKeymapDocument = {
    layout: DEFAULT_MAC_LAYOUT,
    profile: CORNIX_PROFILE_NAME,
    layers: new Map([[0, new Map()]]),
  };
  return serializeMacKeymapYaml(document);
}
