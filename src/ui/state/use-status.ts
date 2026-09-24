import { useState } from "react";
import type { RoundTripProgress } from "../../device/protocol.ts";

/**
 * status bar の通知と、実機との往復の進捗。
 *
 * 通知は操作の結果を 1 行で伝える。進捗があるあいだは通知より進捗を出す。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useStatus(initial: string): {
  readonly message: string;
  readonly progress: RoundTripProgress | undefined;
  readonly say: (message: string) => void;
  readonly setProgress: (progress: RoundTripProgress | undefined) => void;
} {
  const [message, setMessage] = useState(initial);
  const [progress, setProgress] = useState<RoundTripProgress | undefined>();
  return { message, progress, say: setMessage, setProgress };
}

/** 例外を利用者向けの 1 行にする。 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
