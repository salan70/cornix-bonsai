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

/** `mac-keyboard.jis.yaml` と `karabiner.json` を置いた一時 workspace。 */
async function workspace(
  name = "mac-keyboard.jis.yaml",
): Promise<{ readonly root: string; readonly karabiner: string; readonly desired: string }> {
  const root = await mkdtemp(join(tmpdir(), "cornix-mac-"));
  const desired = join(root, name);
  await copyFile(join(FIXTURES, "desired.yaml"), desired);
  const karabiner = join(root, "karabiner.json");
  await copyFile(join(FIXTURES, "karabiner-baseline.json"), karabiner);
  return { root, karabiner, desired };
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
  const { code, json } = await captureJson([
    "mac",
    "generate",
    "--layout",
    "jis",
    "--workspace",
    root,
  ]);

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
  const { root, desired } = await workspace();
  await writeFile(
    desired,
    'schema: cornix-bonsai/mac-keymap@1\nprofile: "Cornix Bonsai"\nlayers:\n  0:\n    "a": "TD(0)"\n',
    "utf8",
  );
  const { code, json } = await captureJson([
    "mac",
    "generate",
    "--layout",
    "jis",
    "--workspace",
    root,
  ]);
  strictEqual(code, 1);
  strictEqual(json.summary?.error, 1);
  deepStrictEqual(await readdir(join(root)), ["karabiner.json", "mac-keyboard.jis.yaml"]);
});

test("mac diffはkarabiner.jsonを書き換えない", async () => {
  const { root, karabiner } = await workspace();
  const before = await readFile(karabiner, "utf8");

  const { code, json } = await captureJson([
    "mac",
    "diff",
    "--layout",
    "jis",
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
    "--layout",
    "jis",
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
    "--layout",
    "jis",
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
  const plan = await captureJson([
    "mac",
    "apply",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
  ]);

  const { code, json } = await captureJson([
    "mac",
    "apply",
    "--layout",
    "jis",
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
  const again = await captureJson([
    "mac",
    "diff",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
  ]);
  strictEqual(again.json.diff?.changed, false);
});

test("errorのあるdesired stateは適用しない", async () => {
  const { root, karabiner, desired } = await workspace();
  const before = await readFile(karabiner, "utf8");
  await writeFile(
    desired,
    'schema: cornix-bonsai/mac-keymap@1\nprofile: "Cornix Bonsai"\nlayers:\n  0:\n    "a": "TD(0)"\n',
    "utf8",
  );

  const { code } = await capture([
    "mac",
    "apply",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--karabiner",
    karabiner,
  ]);

  strictEqual(code, 1);
  strictEqual(await readFile(karabiner, "utf8"), before);
});

test("その配列の設定が無ければkeymap.yamlを探さずに落ちる", async () => {
  const root = await mkdtemp(join(tmpdir(), "cornix-mac-"));
  const { code } = await capture(["mac", "generate", "--layout", "jis", "--workspace", root]);
  strictEqual(code, 1);
});

test("旧名のmac-keyboard.yamlはlayout宣言が一致する配列として読む", async () => {
  const { root } = await workspace("mac-keyboard.yaml");
  const jis = await captureJson(["mac", "generate", "--layout", "jis", "--workspace", root]);
  strictEqual(jis.code, 0);
  // 宣言は jis なので、ansi を求められても使わない。
  const ansi = await capture(["mac", "generate", "--layout", "ansi", "--workspace", root]);
  strictEqual(ansi.code, 1);
});

test("ファイル名と食い違うlayout宣言は落ちる", async () => {
  const { root } = await workspace("mac-keyboard.ansi.yaml");
  const { code } = await capture(["mac", "generate", "--layout", "ansi", "--workspace", root]);
  strictEqual(code, 1);
});

test("--layoutが未対応の値なら落ちる", async () => {
  const { root } = await workspace();
  strictEqual((await capture(["mac", "generate", "--layout", "iso", "--workspace", root])).code, 1);
});

test("未知のmacサブコマンドは落ちる", async () => {
  const { root } = await workspace();
  strictEqual((await capture(["mac", "publish", "--workspace", root])).code, 1);
});

const DEVICES = join(FIXTURES, "karabiner-devices.json");

test("mac devices は観測されたキーボードを出し、書き換えない", async () => {
  const { root, desired } = await workspace();
  const before = await readFile(desired, "utf8");
  const { code, out } = await capture([
    "mac",
    "devices",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--devices",
    DEVICES,
  ]);
  strictEqual(code, 0);
  const json = JSON.parse(out) as {
    observed: readonly { product: string; identifier: string | null; registered: boolean }[];
  };
  deepStrictEqual(
    json.observed.map((entry) => [entry.product, entry.identifier, entry.registered]),
    [
      ["Apple Internal Keyboard / Trackpad", null, true],
      ["Magic Keyboard", "1452:630", false],
    ],
  );
  strictEqual(await readFile(desired, "utf8"), before, "--add が無ければ書き換えない");
});

test("mac devices --add は devices へ足して書き戻す", async () => {
  const { root, desired } = await workspace();
  const { code } = await capture([
    "mac",
    "devices",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--add",
    "1452:630",
  ]);
  strictEqual(code, 0);
  const text = await readFile(desired, "utf8");
  strictEqual(
    text.includes("  - { built_in: true }\n  - { vendor_id: 1452, product_id: 630 }\n"),
    true,
  );

  // 二重に足さない。
  await capture(["mac", "devices", "--layout", "jis", "--workspace", root, "--add", "1452:630"]);
  strictEqual(await readFile(desired, "utf8"), text);
});

test("mac devices --add が <vendor>:<product> の形でなければ落ちる", async () => {
  const { root } = await workspace();
  const { code } = await capture([
    "mac",
    "devices",
    "--layout",
    "jis",
    "--workspace",
    root,
    "--add",
    "abc",
  ]);
  strictEqual(code, 1);
});
