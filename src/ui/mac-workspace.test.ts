import { ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import { initialMacKeymapYaml, probeMacKeymap } from "./mac-workspace.ts";

function fakeStore(text: string | undefined, modifiedAt = 1000) {
  return {
    readText: () => Promise.resolve(text),
    stat: () => Promise.resolve(text === undefined ? undefined : { modifiedAt }),
  };
}

test("mac-keyboard.yamlがあればreadyとtokenを返す", async () => {
  const state = await probeMacKeymap(
    fakeStore(
      'schema: cornix-bonsai/mac-keymap@1\nlayout: jis\nprofile: "Cornix Bonsai"\nlayers:\n  0:\n    "a": "KC_B"\n',
    ),
  );
  ok(state.kind === "ready");
  strictEqual(state.document.layers.get(0)?.get("a"), "KC_B");
  strictEqual(state.token?.modifiedAt, 1000);
});

test("mac-keyboard.yamlが無ければmissingになる", async () => {
  const state = await probeMacKeymap(fakeStore(undefined));
  strictEqual(state.kind, "missing");
});

test("parse失敗はerrorに閉じ込め、例外を外へ出さない", async () => {
  // Macの不調でworkspace全体（Vial編集）を止めない（ADR 0025）。
  const state = await probeMacKeymap(
    fakeStore("schema: cornix-bonsai/mac-keymap@1\nlayout: dvorak\n"),
  );
  ok(state.kind === "error");
  ok(state.reason.length > 0);
});

test("readTextの例外もerrorに畳む", async () => {
  const state = await probeMacKeymap({
    readText: () => Promise.reject(new Error("permission denied")),
    stat: () => Promise.resolve(undefined),
  });
  ok(state.kind === "error");
  strictEqual(state.reason, "permission denied");
});

test("作成導線の初期YAMLは空のlayer 0を持つJISとしてparseできる", async () => {
  const document = parseMacKeymapYaml(initialMacKeymapYaml());
  strictEqual(document.layout, "jis");
  strictEqual(document.layers.get(0)?.size, 0);
});
