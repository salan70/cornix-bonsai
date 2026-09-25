import { ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { macKeymapPath } from "../workspace/layout.ts";
import type { UiWorkspaceStore } from "./workspace-probe.ts";
import { defaultEditTarget, probeStore } from "./workspace-probe.ts";

const jisYaml =
  'schema: keysync/mac-keymap@1\nlayout: jis\nprofile: "KeySync"\nlayers:\n  0:\n    "a": "KC_B"\n';

function fakeStore(files: Readonly<Record<string, string | undefined>>): UiWorkspaceStore {
  return {
    directory: { name: "ws" },
    readText: (path) => Promise.resolve(files[path]),
    writeText: () => Promise.reject(new Error("write not used")),
    readBytes: (path) => {
      const text = files[path];
      return Promise.resolve(text === undefined ? undefined : new TextEncoder().encode(text));
    },
    writeBytes: () => Promise.reject(new Error("write not used")),
    stat: (path) => Promise.resolve(files[path] === undefined ? undefined : { modifiedAt: 1000 }),
    ensureDirectory: () => Promise.resolve(),
  };
}

test("keymap.yamlが無くてもworkspaceは開きMacを読む", async () => {
  const probe = await probeStore(fakeStore({ [macKeymapPath("jis")]: jisYaml }));
  ok(probe.kind === "ready");
  strictEqual(probe.model.cornix.kind, "missing");
  ok(probe.model.mac.jis.kind === "ready");
  strictEqual(probe.model.mac.ansi.kind, "missing");
  const target = defaultEditTarget(probe.model);
  ok(target.kind === "mac");
  strictEqual(target.layout, "jis");
});

test("壊れたkeymap.yamlはcornix errorに閉じMac編集を止めない", async () => {
  const probe = await probeStore(
    fakeStore({
      "keymap.yaml": "not: valid: yaml: [",
      [macKeymapPath("jis")]: jisYaml,
    }),
  );
  ok(probe.kind === "ready");
  ok(probe.model.cornix.kind === "error");
  ok(probe.model.mac.jis.kind === "ready");
});
