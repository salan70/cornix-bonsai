import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { createSaveQueue } from "./save-queue.ts";
import { WorkspaceConflictError, type WorkspaceConflictToken } from "./types.ts";

/** 書き込むたびに hash と mtime が進む、実 filesystem 相当の mock。 */
function createStore(initial: string) {
  let content = initial;
  let revision = 0;
  const writes: string[] = [];
  return {
    writes,
    external(text: string): void {
      content = text;
      revision++;
    },
    get content(): string {
      return content;
    },
    async writeText(_path: string, text: string): Promise<void> {
      // 実際の書き込みと同じく、await をまたいで完了する。
      await Promise.resolve();
      content = text;
      revision++;
      writes.push(text);
    },
    async stat(): Promise<WorkspaceConflictToken> {
      await Promise.resolve();
      return { modifiedAt: revision, contentHash: `hash-${revision}` };
    },
  };
}

test("連続した編集は保存順序に関係なく最後の入力を残す", async () => {
  const store = createStore("a");
  const errors: unknown[] = [];
  const queue = createSaveQueue({
    store,
    path: "keymap.yaml",
    token: await store.stat(),
    onError: (error) => errors.push(error),
  });

  queue.enqueue("ab");
  queue.enqueue("abc");
  queue.enqueue("abcd");
  await queue.drain();

  deepStrictEqual(errors, []);
  strictEqual(store.content, "abcd");
  // 中間状態は畳んでよいが、最後の入力は必ず残る。自己 write を外部変更と誤検出しない。
  strictEqual(store.writes.at(-1), "abcd");
  strictEqual(store.writes.includes("ab"), true);
});

test("外部変更を検出したら上書きせず、待ち中の保存も捨てる", async () => {
  const store = createStore("a");
  const errors: unknown[] = [];
  const queue = createSaveQueue({
    store,
    path: "keymap.yaml",
    token: await store.stat(),
    onError: (error) => errors.push(error),
  });

  store.external("外部から書き換えた");
  queue.enqueue("ab");
  queue.enqueue("abc");
  await queue.drain();

  strictEqual(errors.length, 1);
  strictEqual(errors[0] instanceof WorkspaceConflictError, true);
  strictEqual(store.content, "外部から書き換えた");
  deepStrictEqual(store.writes, []);
});

test("保存成功のたびにtokenが1本の順序で更新される", async () => {
  const store = createStore("a");
  const saved: number[] = [];
  const errors: unknown[] = [];
  const queue = createSaveQueue({
    store,
    path: "keymap.yaml",
    token: await store.stat(),
    onSaved: () => saved.push(saved.length),
    onError: (error) => errors.push(error),
  });

  queue.enqueue("b");
  await queue.drain();
  queue.enqueue("c");
  await queue.drain();

  deepStrictEqual(errors, []);
  deepStrictEqual(store.writes, ["b", "c"]);
  strictEqual(saved.length, 2);
});
