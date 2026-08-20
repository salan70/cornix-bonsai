/**
 * `keymap.yaml` への保存を直列化する queue。
 *
 * 編集は入力ごとに起きるが、保存は filesystem への非同期 I/O である。UI の state 更新と
 * 同じ経路で保存すると、次の 2 つが起きる。
 *
 * - 先行 save が書き込んだ内容を、後続 save が「外部変更」と誤検出する
 * - 同じ token で複数の save が競合検査を通り、write 順が入れ替わって古い内容が残る
 *
 * そこで write を 1 本の列にし、競合検査に使う token をこの列だけが更新する。
 * 列の途中の中間状態は捨ててよい（最後の内容が残ればよい）ため、待ち中の text は
 * 常に最新の 1 つへ畳む。
 */

import {
  writeTextIfUnchanged,
  type WorkspaceConflictToken,
  type WorkspaceFileStore,
} from "./types.ts";

export interface SaveQueueOptions {
  readonly store: Pick<WorkspaceFileStore, "writeText" | "stat">;
  readonly path: string;
  /** 読み込み時の token。以後は成功した write ごとにこの queue が更新する。 */
  readonly token: WorkspaceConflictToken | undefined;
  readonly onSaved?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface SaveQueue {
  /** 保存を予約する。待ち中の内容があれば最新の 1 つへ畳む。 */
  enqueue(text: string): void;
  /** 列が空になるまで待つ。 */
  drain(): Promise<void>;
}

/** @doc docs/specs/workspace-cli.md#保存の直列化 */
export function createSaveQueue(options: SaveQueueOptions): SaveQueue {
  let token = options.token;
  let pending: string | undefined;
  let running: Promise<void> | undefined;

  async function run(): Promise<void> {
    while (pending !== undefined) {
      const text = pending;
      pending = undefined;
      try {
        await writeTextIfUnchanged(options.store, options.path, text, token);
        token = (await options.store.stat(options.path)) ?? undefined;
        options.onSaved?.();
      } catch (error) {
        // 競合を検出したら以降の予約も捨てる。外部変更の取り込みは明示的な再読み込みで行う。
        pending = undefined;
        options.onError?.(error);
      }
    }
    running = undefined;
  }

  return {
    enqueue(text: string): void {
      pending = text;
      running ??= run();
    },
    async drain(): Promise<void> {
      while (running !== undefined) await running;
    },
  };
}
