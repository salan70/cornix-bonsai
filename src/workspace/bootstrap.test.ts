import { strictEqual, notStrictEqual } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { parseVil } from "../core/vil/parse.ts";
import { planBindingMigration, planWorkspaceInit, writeWorkspacePlan } from "./bootstrap.ts";
import { definitionPath, readDefinitionBinding, sha256Hex, WORKSPACE_LAYOUT } from "./layout.ts";

const DEFINITION = readFileSync("fixtures/cornix-lp/vial-definition-v1.12.json", "utf8");
const DOCUMENT = parseVil(readFileSync("fixtures/cornix-lp/baseline.vil", "utf8"));

/** writeText / readBytes だけを持つ memory store。 */
function memoryStore(seed: Readonly<Record<string, string>> = {}) {
  const files = new Map<string, Uint8Array>();
  for (const [path, text] of Object.entries(seed)) files.set(path, encode(text));
  return {
    files,
    readText: async (path: string) => {
      const bytes = files.get(path);
      return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
    },
    readBytes: async (path: string) => files.get(path),
    writeText: async (path: string, text: string) => void files.set(path, encode(text)),
  };
}
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

test("実機readから作ったworkspaceはそのまま読み戻せる", async () => {
  const store = memoryStore();
  const plan = await planWorkspaceInit(DOCUMENT, DEFINITION, webcrypto);
  await writeWorkspacePlan(store, plan);

  const keymapText = await store.readText(WORKSPACE_LAYOUT.keymap);
  strictEqual(typeof keymapText, "string");
  const parsed = parseKeymapYaml(keymapText!);
  strictEqual(parsed.binding.definitionDigest, plan.definitionDigest);
  strictEqual(parsed.binding.definitionPath, plan.definitionPath);
  strictEqual(parsed.binding.keyboardUid, DOCUMENT.uid);

  // binding 検証を通り抜けることまで確認する。ここが通らないと UI で開けない。
  await readDefinitionBinding(
    store,
    parsed.binding.definitionPath,
    parsed.binding.definitionDigest,
    webcrypto,
  );
});

test("bytesをそのままdigestした旧bindingを検出して移行できる", async () => {
  // 旧規則: canonical 化せずファイルの bytes をそのまま SHA-256 していた。
  const legacyDigest = await sha256Hex(encode(DEFINITION), webcrypto);
  const legacyPath = definitionPath(legacyDigest);
  const store = memoryStore({ [legacyPath]: DEFINITION });
  const binding = {
    keyboardUid: DOCUMENT.uid,
    keyboardName: "Cornix LP",
    definitionPath: legacyPath,
    definitionDigest: legacyDigest,
  };

  const migration = await planBindingMigration(store, DOCUMENT, binding, webcrypto);
  if (migration === undefined) throw new Error("旧bindingを検出できなかった");
  notStrictEqual(migration.definitionDigest, legacyDigest);
  strictEqual(migration.previousDigest, legacyDigest);
  strictEqual(migration.previousPath, legacyPath);

  await writeWorkspacePlan(store, migration);
  const parsed = parseKeymapYaml((await store.readText(WORKSPACE_LAYOUT.keymap))!);
  strictEqual(parsed.binding.definitionDigest, migration.definitionDigest);
  // keyboardUid / keyboardName は移行で失わない。
  strictEqual(parsed.binding.keyboardUid, binding.keyboardUid);
  strictEqual(parsed.binding.keyboardName, binding.keyboardName);
  await readDefinitionBinding(
    store,
    parsed.binding.definitionPath,
    parsed.binding.definitionDigest,
    webcrypto,
  );
});

test("内容が書き換わったdefinitionは移行しない", async () => {
  // 旧規則の digest と bytes が一致しない = 当時の内容と同じである証明が無い。
  const legacyDigest = await sha256Hex(encode(DEFINITION), webcrypto);
  const legacyPath = definitionPath(legacyDigest);
  const store = memoryStore({ [legacyPath]: DEFINITION.replace('"rows": 8', '"rows": 6') });

  strictEqual(
    await planBindingMigration(
      store,
      DOCUMENT,
      {
        keyboardUid: DOCUMENT.uid,
        keyboardName: "Cornix LP",
        definitionPath: legacyPath,
        definitionDigest: legacyDigest,
      },
      webcrypto,
    ),
    undefined,
  );
});

test("definitionが見つからない場合は移行しない", async () => {
  const store = memoryStore();
  strictEqual(
    await planBindingMigration(
      store,
      DOCUMENT,
      {
        keyboardUid: DOCUMENT.uid,
        keyboardName: "Cornix LP",
        definitionPath: "cornix/definitions/0123456789abcdef.json",
        definitionDigest: "0".repeat(64),
      },
      webcrypto,
    ),
    undefined,
  );
});

test("既にcanonicalなbindingは移行対象にしない", async () => {
  const plan = await planWorkspaceInit(DOCUMENT, DEFINITION, webcrypto);
  const store = memoryStore({ [plan.definitionPath]: plan.definitionText });

  strictEqual(
    await planBindingMigration(
      store,
      DOCUMENT,
      {
        keyboardUid: DOCUMENT.uid,
        keyboardName: "Cornix LP",
        definitionPath: plan.definitionPath,
        definitionDigest: plan.definitionDigest,
      },
      webcrypto,
    ),
    undefined,
  );
});
