import { WorkspaceConflictError } from "../workspace/types.ts";

/**
 * 1 ファイルの保存状態。
 *
 * @doc docs/specs/ui.md#side-panel-editing-controls
 */
export type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "conflict"; readonly message: string };

export type SaveTarget = "keymap" | "labels" | "mac";

export interface SaveCandidate {
  readonly target: SaveTarget;
  readonly path: string;
  readonly state: SaveState;
}

/**
 * 単一表示領域で複数ファイルの保存状態を優先順位に従って代表させる。
 *
 * 優先順は conflict > error > saving > saved > idle。同じ順位では先に渡したものを残す。
 *
 * @doc docs/specs/ui.md#side-panel-editing-controls
 */
export function chooseSaveCandidate(candidates: readonly SaveCandidate[]): SaveCandidate {
  if (candidates.length === 0) throw new Error("保存対象がありません");
  return candidates.reduce((best, candidate) =>
    saveStateRank(candidate.state) > saveStateRank(best.state) ? candidate : best,
  );
}

/**
 * 保存キューの失敗を保存状態へ畳む。
 *
 * 外部変更との競合は再試行で解けないため、通常の I/O 失敗と別の状態にする。
 *
 * @doc docs/specs/ui.md#side-panel-editing-controls
 */
export function saveFailureState(error: unknown): SaveState {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof WorkspaceConflictError
    ? { kind: "conflict", message }
    : { kind: "error", message };
}

function saveStateRank(state: SaveState): number {
  return state.kind === "conflict"
    ? 4
    : state.kind === "error"
      ? 3
      : state.kind === "saving"
        ? 2
        : state.kind === "saved"
          ? 1
          : 0;
}
