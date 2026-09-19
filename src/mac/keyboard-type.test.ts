/**
 * 検出の検証。
 *
 * **実行マシンの配列を期待値に書かない。** 手元は ANSI だが CI の macOS runner は
 * 別で、そこで落ちる test になる。ここで固定するのは「落ちない」「扱える値か
 * undefined しか返さない」の2点だけ。
 */

import { ok } from "node:assert/strict";
import { test } from "node:test";
import { detectBuiltInLayout } from "./keyboard-type.ts";

test("detectBuiltInLayout は ansi / jis / undefined のいずれかを返す", async () => {
  const layout = await detectBuiltInLayout();
  ok(layout === undefined || layout === "ansi" || layout === "jis", String(layout));
});

test("detectBuiltInLayout は例外を投げない", async () => {
  await detectBuiltInLayout();
});
