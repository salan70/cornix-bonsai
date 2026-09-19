import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  defaultKarabinerConfigPath,
  readKarabinerConfig,
  readObservedKeyboards,
  writeFileAtomic,
} from "./node.ts";

async function workDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cornix-karabiner-"));
}

test("既定のpathはKarabinerが読む場所を指す", () => {
  strictEqual(defaultKarabinerConfigPath().endsWith("/.config/karabiner/karabiner.json"), true);
});

test("読み込みはテキストもそのまま返す", async () => {
  // backupは読んだテキストをそのまま書き戻す。再serializeするとKarabiner独自の整形が落ちる。
  const directory = await workDir();
  const path = join(directory, "karabiner.json");
  const text = '{\n    "profiles": [ { "name": "Default profile" } ]\n}\n';
  await writeFile(path, text, "utf8");

  const { config, text: read } = await readKarabinerConfig(path);
  strictEqual(read, text);
  deepStrictEqual(config.profiles[0], { name: "Default profile" });
});

test("profilesが無いファイルは読まずに落ちる", async () => {
  const directory = await workDir();
  const path = join(directory, "karabiner.json");
  await writeFile(path, '{"global":{}}', "utf8");
  await rejects(readKarabinerConfig(path), /profiles が無い/);
});

test("壊れたJSONは読まずに落ちる", async () => {
  const directory = await workDir();
  const path = join(directory, "karabiner.json");
  await writeFile(path, "{", "utf8");
  await rejects(readKarabinerConfig(path), /JSON として読めない/);
});

test("書き込みはtempへ書いてからrenameし、tempを残さない", async () => {
  // Karabinerは親ディレクトリをwatchして自動reloadする。途中まで書けたファイルを見せない。
  const directory = await workDir();
  const path = join(directory, "karabiner.json");
  await writeFile(path, "old", "utf8");

  await writeFileAtomic(path, "new");

  strictEqual(await readFile(path, "utf8"), "new");
  deepStrictEqual(await readdir(directory), ["karabiner.json"]);
});

test("readObservedKeyboards はキーボードだけを返し、仮想デバイスを外す", async () => {
  const path = join(import.meta.dirname, "../../fixtures/mac-keyboard/karabiner-devices.json");
  const keyboards = await readObservedKeyboards(path);
  deepStrictEqual(keyboards, [
    {
      product: "Apple Internal Keyboard / Trackpad",
      manufacturer: "Apple",
      builtIn: true,
      vendorId: undefined,
      productId: undefined,
    },
    {
      product: "Magic Keyboard",
      manufacturer: "Apple Inc.",
      builtIn: false,
      vendorId: 1452,
      productId: 630,
    },
  ]);
});

test("readObservedKeyboards はファイルが無ければ undefined", async () => {
  strictEqual(await readObservedKeyboards(join(import.meta.dirname, "nope.json")), undefined);
});
