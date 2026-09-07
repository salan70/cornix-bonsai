/**
 * `cornix mac` の検証。
 *
 * `karabiner_cli` には依存しない。CI の macOS runner に入っていないため、
 * lint を通ることの確認はローカルで行う（ADR 0022）。
 */

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { copyFile, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "./main.ts";

const FIXTURES = join(import.meta.dirname, "../../fixtures/mac-keyboard");

/** `mac-keyboard.yaml` と `karabiner.json` を置いた一時 workspace。 */
async function workspace(): Promise<{ readonly root: string; readonly karabiner: string }> {
  const root = await mkdtemp(join(tmpdir(), "cornix-mac-"));
  await copyFile(join(FIXTURES, "desired.yaml"), join(root, "mac-keyboard.yaml"));
  const karabiner = join(root, "karabiner.json");
  await copyFile(join(FIXTURES, "karabiner-baseline.json"), karabiner);
  return { root, karabiner };
}

/** `console.log` を捕まえる。CLI は JSON を stdout へ出すだけなので、これで十分に読める。 */
async function capture(argv: readonly string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    const code = await main([...argv]);
    return { code, out: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

/** CLI が stdout へ出す JSON のうち、test が読む範囲だけを型にする。 */
interface MacOutput {
  readonly output?: string;
  readonly summary?: { readonly error: number };
  readonly diagnostics?: readonly { readonly code: string }[];
  readonly fingerprint?: string;
  readonly confirm?: string;
  readonly backup?: string;
  readonly diff?: { readonly present: boolean; readonly changed: boolean };
  readonly verify?: { readonly ok: boolean; readonly entries: readonly unknown[] };
}

async function captureJson(
  argv: readonly string[],
): Promise<{ readonly code: number; readonly json: MacOutput }> {
  const { code, out } = await capture(argv);
  return { code, json: JSON.parse(out) as MacOutput };
}

test("mac generate はcornix/generated/へassetを書く", async () => {
  const { root } = await workspace();
  const { code, json } = await captureJson(["mac", "generate", "--workspace", root]);

  strictEqual(code, 0);
  strictEqual(json.output, "cornix/generated/karabiner-complex-modifications.json");
  deepStrictEqual(json.diagnostics, []);

  const asset = JSON.parse(await readFile(join(root, String(json.output)), "utf8")) as {
    title: string;
    rules: { description: string }[];
  };
  strictEqual(asset.title, "Cornix Bonsai");
  deepStrictEqual(
    asset.rules.map((rule) => rule.description),
    [
      "Cornix Bonsai layer 3",
      "Cornix Bonsai layer 2",
      "Cornix Bonsai layer 1",
      "Cornix Bonsai layer 0",
    ],
  );
});

test("errorのあるdesired stateはgenerateしない", async () => {
  const { root } = await workspace();
  await writeFile(
    join(root, "mac-keyboard.yaml"),
    'schema: cornix-bonsai/mac-keymap@1\nprofile: "Cornix Bonsai"\nlayers:\n  0:\n    "a": "TD(0)"\n',
    "utf8",
  );
  const { code, json } = await captureJson(["mac", "generate", "--workspace", root]);
  strictEqual(code, 1);
  strictEqual(json.summary?.error, 1);
  deepStrictEqual(await readdir(join(root)), ["karabiner.json", "mac-keyboard.yaml"]);
});

test("mac diffはkarabiner.jsonを書き換えない", async () => {
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");

  const { code, json } = await captureJson([
    "mac",
    "diff",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
  ]);

  strictEqual(code, 0);
  strictEqual(json.diff?.present, true);
  strictEqual(json.diff?.changed, true);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("mac applyは--confirmが無ければ書かない", async () => {
  // 人間が中身を見てから同じfingerprintを渡したときだけ書き込む（ADR 0022）。
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");

  const { code, json } = await captureJson([
    "mac",
    "apply",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
  ]);

  strictEqual(code, 0);
  strictEqual(json.confirm, `cornix mac apply --confirm ${json.fingerprint}`);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("fingerprintが一致しないapplyは書かずに落ちる", async () => {
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");

  const { code } = await capture([
    "mac",
    "apply",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
    "--confirm",
    "v1-dead-beef",
  ]);

  strictEqual(code, 1);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("applyはbackupを取り、所有profile以外を保ち、verifyまで通す", async () => {
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");
  const plan = await captureJson(["mac", "apply", "--workspace", root, "--karabiner", karabiner]);

  const { code, json } = await captureJson([
    "mac",
    "apply",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
    "--confirm",
    String(plan.json.fingerprint),
  ]);

  strictEqual(code, 0);
  deepStrictEqual(json.verify, { ok: true, entries: [] });

  // backupは読んだテキストをそのまま置く。再serializeするとKarabiner独自の整形が落ちる。
  strictEqual(await readFile(join(root, String(json.backup)), "utf8"), before);

  const applied = JSON.parse(await readFile(karabiner, "utf8")) as {
    global: unknown;
    profiles: { name: string; selected?: boolean }[];
  };
  const original = JSON.parse(before) as typeof applied;
  deepStrictEqual(applied.global, original.global);
  deepStrictEqual(applied.profiles[0], original.profiles[0]);
  strictEqual(applied.profiles[1]?.selected, undefined);

  // 同じdesiredをもう一度当てても差分は出ない。
  const again = await captureJson(["mac", "diff", "--workspace", root, "--karabiner", karabiner]);
  strictEqual(again.json.diff?.changed, false);
});

test("errorのあるdesired stateは適用しない", async () => {
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");
  await writeFile(
    join(root, "mac-keyboard.yaml"),
    'schema: cornix-bonsai/mac-keymap@1\nprofile: "Cornix Bonsai"\nlayers:\n  0:\n    "a": "TD(0)"\n',
    "utf8",
  );

  const { code } = await capture(["mac", "apply", "--workspace", root, "--karabiner", karabiner]);

  strictEqual(code, 1);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("mac-keyboard.yamlが無ければkeymap.yamlを探さずに落ちる", async () => {
  const root = await mkdtemp(join(tmpdir(), "cornix-mac-"));
  const { code } = await capture(["mac", "generate", "--workspace", root]);
  strictEqual(code, 1);
});

test("未知のmacサブコマンドは落ちる", async () => {
  const { root } = await workspace();
  strictEqual((await capture(["mac", "publish", "--workspace", root])).code, 1);
});
