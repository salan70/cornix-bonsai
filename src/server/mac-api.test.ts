/**
 * ローカルサーバーの Mac 適用 API の検証。
 *
 * `karabiner_cli` は必ず偽物を注入する。実物を通すと、test を回しただけで動いている
 * Karabiner の profile が切り替わる。
 */

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseMacKeymapYaml } from "../core/mac-keymap/parse.ts";
import type { MacKeyboardLayout } from "../core/mac-keymap/types.ts";
import type { KarabinerCli, KarabinerCliResult } from "../karabiner/node.ts";
import { macKeymapDigest } from "../workspace/mac-keymap-file.ts";
import { createMacApi } from "./mac-api.ts";
import { MAC_API } from "./protocol.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/mac-keyboard");

interface Setup {
  readonly root: string;
  readonly karabiner: string;
  readonly digest: string;
  readonly calls: string[];
  readonly api: ReturnType<typeof createMacApi>;
}

async function setup(
  options: {
    readonly machine?: MacKeyboardLayout | undefined;
    readonly lint?: KarabinerCliResult;
    readonly select?: KarabinerCliResult;
    readonly absent?: boolean;
  } = {},
): Promise<Setup> {
  const root = await mkdtemp(join(tmpdir(), "cornix-mac-api-"));
  await copyFile(join(FIXTURES, "desired.yaml"), join(root, "mac-keyboard.jis.yaml"));
  const karabiner = join(root, "karabiner.json");
  await copyFile(join(FIXTURES, "karabiner-baseline.json"), karabiner);
  const text = await readFile(join(root, "mac-keyboard.jis.yaml"), "utf8");
  const digest = await macKeymapDigest(parseMacKeymapYaml(text), webcrypto);

  const calls: string[] = [];
  const absent = options.absent === true;
  let current: string | undefined = "Default profile";
  const cli: KarabinerCli = {
    async lintComplexModifications(path) {
      calls.push(`lint ${path}`);
      return absent ? undefined : (options.lint ?? { ok: true, output: `${path}: ok` });
    },
    async selectProfile(name) {
      calls.push(`select ${name}`);
      if (absent) return undefined;
      const result = options.select ?? { ok: true, output: "" };
      if (result.ok) current = name;
      return result;
    },
    async currentProfileName() {
      return absent ? undefined : current;
    },
  };
  const machine = "machine" in options ? options.machine : "jis";
  const api = createMacApi({
    root,
    karabiner,
    cli,
    detectLayout: async () => machine,
    crypto: webcrypto,
  });
  return { root, karabiner, digest, calls, api };
}

test("status はこのマシンの配列と workspace を返す", async () => {
  const { api, root } = await setup({ machine: "ansi" });
  deepStrictEqual(await api(MAC_API.status, {}), {
    kind: "status",
    workspace: root,
    layout: "ansi",
  });
});

test("編集中の配列とこのマシンの配列が違えば計画を組まない", async () => {
  const { api, digest, karabiner } = await setup({ machine: "ansi" });
  const before = await readFile(karabiner, "utf8");
  deepStrictEqual(await api(MAC_API.plan, { layout: "jis", digest }), {
    kind: "layout-mismatch",
    machine: "ansi",
    requested: "jis",
  });
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("配列を検出できなければ止める", async () => {
  const { api, digest } = await setup({ machine: undefined });
  const result = await api(MAC_API.plan, { layout: "jis", digest });
  strictEqual(result?.kind, "layout-mismatch");
});

test("画面の内容とディスクの内容が違えば止める", async () => {
  const { api, root } = await setup();
  deepStrictEqual(await api(MAC_API.plan, { layout: "jis", digest: "0".repeat(64) }), {
    kind: "digest-mismatch",
    path: join(root, "mac-keyboard.jis.yaml"),
  });
});

test("コメントや並びが違っても同じ設定なら digest は一致する", async () => {
  const { api, root, digest } = await setup();
  const path = join(root, "mac-keyboard.jis.yaml");
  await writeFile(path, `# 手で足したコメント\n${await readFile(path, "utf8")}`);
  strictEqual((await api(MAC_API.plan, { layout: "jis", digest }))?.kind, "planned");
});

test("plan は差分と fingerprint を返し、karabiner.json に触れない", async () => {
  const { api, digest, karabiner } = await setup();
  const before = await readFile(karabiner, "utf8");
  const result = await api(MAC_API.plan, { layout: "jis", digest });
  strictEqual(result?.kind, "planned");
  if (result?.kind !== "planned") return;
  ok(result.fingerprint.startsWith("v1-"));
  ok(result.entries.some((entry) => entry.layer === 0 && entry.keyCode === "caps_lock"));
  strictEqual(result.selection.required, true);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("Karabiner が入っていなければ計画の段階で止める", async () => {
  // Web UI の適用は profile の切り替えまでが 1 つの操作で、必ず途中で失敗する。
  const { api, digest } = await setup({ absent: true });
  deepStrictEqual(await api(MAC_API.plan, { layout: "jis", digest }), {
    kind: "karabiner-missing",
  });
});

test("lint が通らなければ止める", async () => {
  const { api, digest } = await setup({ lint: { ok: false, output: "bad rule" } });
  deepStrictEqual(await api(MAC_API.plan, { layout: "jis", digest }), {
    kind: "lint-failed",
    output: "bad rule",
  });
});

test("fingerprint が違えば書かずに新しい計画を返す", async () => {
  const { api, digest, karabiner } = await setup();
  const before = await readFile(karabiner, "utf8");
  const result = await api(MAC_API.apply, { layout: "jis", digest, fingerprint: "v1-0-0" });
  strictEqual(result?.kind, "fingerprint-mismatch");
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("同じ fingerprint なら backup を取り、書き込み、profile を選ぶ", async () => {
  const { api, digest, karabiner, root, calls } = await setup();
  const before = await readFile(karabiner, "utf8");
  const planned = await api(MAC_API.plan, { layout: "jis", digest });
  if (planned?.kind !== "planned") throw new Error(planned?.kind);
  const result = await api(MAC_API.apply, {
    layout: "jis",
    digest,
    fingerprint: planned.fingerprint,
  });
  strictEqual(result?.kind, "applied");
  if (result?.kind !== "applied") return;
  strictEqual(result.selected, true);
  strictEqual(await readFile(join(root, result.backup), "utf8"), before);
  ok((await readFile(karabiner, "utf8")).includes("KeySync"));
  ok(calls.includes("select KeySync"));
});

test("profile の切り替えだけが失敗したら巻き戻さず、切り替えをやり直せる", async () => {
  const { api, digest, karabiner, root } = await setup({
    select: { ok: false, output: "grabber not running" },
  });
  const planned = await api(MAC_API.plan, { layout: "jis", digest });
  if (planned?.kind !== "planned") throw new Error(planned?.kind);
  const result = await api(MAC_API.apply, {
    layout: "jis",
    digest,
    fingerprint: planned.fingerprint,
  });
  strictEqual(result?.kind, "select-failed");
  ok((await readFile(karabiner, "utf8")).includes("KeySync"));
  ok((await readdir(join(root, "cornix", "backups"))).length === 1);

  const retried = await api(MAC_API.select, { layout: "jis" });
  deepStrictEqual(retried, {
    kind: "selected",
    ok: false,
    observed: "Default profile",
    output: "grabber not running",
  });
});

test("error のある設定は適用しない", async () => {
  const { api, root } = await setup();
  const path = join(root, "mac-keyboard.jis.yaml");
  const text = (await readFile(path, "utf8")).replace('"KC_HOME"', '"NOT_A_KEYCODE"');
  await writeFile(path, text);
  const digest = await macKeymapDigest(parseMacKeymapYaml(text), webcrypto);
  const result = await api(MAC_API.plan, { layout: "jis", digest });
  strictEqual(result?.kind, "invalid");
});

test("本文が壊れていれば failed を返し、知らない path には undefined を返す", async () => {
  const { api } = await setup();
  strictEqual((await api(MAC_API.plan, { layout: "iso", digest: "x" }))?.kind, "failed");
  strictEqual(await api("/api/mac/unknown", {}), undefined);
});
