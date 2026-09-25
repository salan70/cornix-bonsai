/**
 * `keysync migrate` の検証。改名前の `cornix/` を `keysync/` へ移す（ADR 0036）。
 */

import { strictEqual } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { parseVil } from "../core/vil/parse.ts";
import { planWorkspaceInit } from "../workspace/bootstrap.ts";
import { WORKSPACE_LAYOUT } from "../workspace/layout.ts";
import { NodeWorkspaceStore } from "../workspace/node.ts";
import { main } from "./main.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/cornix-lp");

/** 改名前の配置で作った workspace。 */
async function legacyWorkspace(): Promise<{ readonly root: string; readonly legacyPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "keysync-migrate-"));
  const plan = await planWorkspaceInit(
    parseVil(await readFile(join(FIXTURES, "baseline.vil"), "utf8")),
    await readFile(join(FIXTURES, "vial-definition-v1.12.json"), "utf8"),
    webcrypto,
  );
  const legacyPath = plan.definitionPath.replace("keysync/definitions/", "cornix/definitions/");
  const store = new NodeWorkspaceStore(root);
  await store.writeText(legacyPath, plan.definitionText);
  await store.writeText(
    "cornix/labels.yaml",
    'schema: cornix-bonsai/labels@1\nlayers:\n  0: "Base"\n',
  );
  await store.writeText(
    WORKSPACE_LAYOUT.keymap,
    plan.keymapText
      .replace("schema: keysync/keymap@1", "schema: cornix-bonsai/keymap@1")
      .replace(plan.definitionPath, legacyPath),
  );
  return { root, legacyPath };
}

async function capture(
  argv: readonly string[],
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => void out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => void err.push(args.map(String).join(" "));
  try {
    const code = await main([...argv]);
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("移行前の workspace は migrate を案内して止まる", async () => {
  const { root } = await legacyWorkspace();
  const result = await capture(["validate", "--workspace", root]);
  strictEqual(result.code, 1);
  strictEqual(result.err.includes("keysync migrate"), true);
});

test("migrate は cornix/ を keysync/ へ写し、keymap.yaml の path を書き直す", async () => {
  const { root, legacyPath } = await legacyWorkspace();
  const result = await capture(["migrate", "--workspace", root]);
  strictEqual(result.code, 0);
  const json = JSON.parse(result.out) as {
    migrated: boolean;
    definition: { from: string; to: string };
    copied: { from: string; to: string }[];
  };
  strictEqual(json.migrated, true);
  strictEqual(json.definition.from, legacyPath);
  strictEqual(json.copied[0]?.to, WORKSPACE_LAYOUT.labels);

  const keymap = parseKeymapYaml(await readFile(join(root, WORKSPACE_LAYOUT.keymap), "utf8"));
  strictEqual(keymap.binding.definitionPath, json.definition.to);
  // 旧 cornix/ は消さない（ADR 0036）。
  strictEqual((await readFile(join(root, legacyPath), "utf8")).length > 0, true);

  const analyzed = await capture(["analyze", "--workspace", root]);
  strictEqual(analyzed.err, "");
  const again = await capture(["migrate", "--workspace", root]);
  strictEqual(again.code, 0);
  strictEqual((JSON.parse(again.out) as { migrated: boolean }).migrated, false);
});
