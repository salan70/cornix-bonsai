import type { SaveState } from "./components/ui/index.ts";

export type SaveTarget = "keymap" | "labels";

export interface SaveCandidate {
  readonly target: SaveTarget;
  readonly path: string;
  readonly state: SaveState;
}

/** 単一表示領域で複数ファイルの保存状態を優先順位に従って代表させる。 */
export function chooseSaveCandidate(candidates: readonly SaveCandidate[]): SaveCandidate {
  if (candidates.length === 0) throw new Error("保存対象がありません");
  return candidates.reduce((best, candidate) =>
    saveStateRank(candidate.state) > saveStateRank(best.state) ? candidate : best,
  );
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
