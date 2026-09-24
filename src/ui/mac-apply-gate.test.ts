import { strictEqual } from "node:assert/strict";
import { test } from "node:test";
import { macApplyBlockedReason } from "./mac-apply-gate.ts";

const OK = {
  machine: { kind: "known", layout: "ansi" },
  layout: "ansi",
  ready: true,
  save: { kind: "saved" },
  errors: 0,
} as const;

test("このマシンの配列で、保存済みで error が無ければ押せる", () => {
  strictEqual(macApplyBlockedReason(OK), undefined);
  strictEqual(macApplyBlockedReason({ ...OK, save: { kind: "idle" } }), undefined);
});

test("サーバーに届かなければ just ui を案内する", () => {
  strictEqual(
    macApplyBlockedReason({ ...OK, machine: { kind: "unreachable" } }),
    "サーバーに接続できない。just ui で起動する",
  );
});

test("配列が違えば、どの Mac で適用するかを示す", () => {
  strictEqual(
    macApplyBlockedReason({ ...OK, layout: "jis" }),
    "この Mac は ANSI。JIS の設定は JIS の Mac で適用する",
  );
  strictEqual(
    macApplyBlockedReason({ ...OK, machine: { kind: "known", layout: null } }),
    "この Mac の配列を検出できない",
  );
});

test("保存待ち・保存失敗・error があれば押せない", () => {
  strictEqual(macApplyBlockedReason({ ...OK, save: { kind: "saving" } }), "保存中…");
  strictEqual(
    macApplyBlockedReason({ ...OK, save: { kind: "conflict", message: "x" } }),
    "保存できていない",
  );
  strictEqual(macApplyBlockedReason({ ...OK, errors: 1 }), "error があるため適用できない");
});

test("先に解決すべき理由を出す", () => {
  // 配列が違えば、保存中でも配列の理由を出す。保存を待っても押せるようにはならない。
  strictEqual(
    macApplyBlockedReason({ ...OK, layout: "jis", save: { kind: "saving" } }),
    "この Mac は ANSI。JIS の設定は JIS の Mac で適用する",
  );
});
