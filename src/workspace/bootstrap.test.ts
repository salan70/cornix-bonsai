import { strictEqual, notStrictEqual } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseKeymapYaml } from "../core/keymap-yaml/parse.ts";
import { parseVil } from "../core/vil/parse.ts";
import {
  planBindingMigration,
  planLayoutMigration,
  planWorkspaceInit,
  writeLayoutMigration,
  writeWorkspacePlan,
} from "./bootstrap.ts";
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
        definitionPath: "keysync/definitions/0123456789abcdef.json",
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

/** 改名前の `cornix/` に置かれた workspace。digest は今の規則で記録されている。 */
async function legacyLayoutStore(seed: Readonly<Record<string, string>> = {}) {
  const plan = await planWorkspaceInit(DOCUMENT, DEFINITION, webcrypto);
  const legacyPath = plan.definitionPath.replace("keysync/definitions/", "cornix/definitions/");
  const keymapText = plan.keymapText
    .replace("schema: keysync/keymap@1", "schema: cornix-bonsai/keymap@1")
    .replace(plan.definitionPath, legacyPath);
  const store = memoryStore({
    [WORKSPACE_LAYOUT.keymap]: keymapText,
    [legacyPath]: plan.definitionText,
    ...seed,
  });
  return { plan, legacyPath, keymapText, store };
}

test("cornix/を指すbindingはkeysync/へ移す計画になり、移行後はそのまま読める", async () => {
  const labels = 'schema: cornix-bonsai/labels@2\nlayers:\n  0: "Base"\nkeycodes:\n';
  const acknowledgements = '["apply/example"]\n';
  const { plan, legacyPath, keymapText, store } = await legacyLayoutStore({
    "cornix/labels.yaml": labels,
    "cornix/acknowledgements.json": acknowledgements,
  });
  const parsed = parseKeymapYaml(keymapText);
  const migration = await planLayoutMigration(store, parsed.document, parsed.binding, webcrypto);

  strictEqual(migration?.previousPath, legacyPath);
  strictEqual(migration.definitionPath, plan.definitionPath);
  strictEqual(migration.definitionDigest, plan.definitionDigest);
  strictEqual(
    JSON.stringify(migration.copies.map(({ from, to }) => [from, to])),
    JSON.stringify([
      ["cornix/labels.yaml", "keysync/labels.yaml"],
      ["cornix/acknowledgements.json", "keysync/acknowledgements.json"],
    ]),
  );

  await writeLayoutMigration(store, migration);
  const migrated = parseKeymapYaml((await store.readText(WORKSPACE_LAYOUT.keymap))!);
  strictEqual(migrated.binding.definitionPath, plan.definitionPath);
  strictEqual(migrated.binding.definitionDigest, plan.definitionDigest);
  strictEqual(
    await readDefinitionBinding(
      store,
      migrated.binding.definitionPath,
      migrated.binding.definitionDigest,
      webcrypto,
    ),
    plan.definitionText,
  );
  strictEqual(await store.readText(WORKSPACE_LAYOUT.labels), labels);
  strictEqual(await store.readText(WORKSPACE_LAYOUT.acknowledgements), acknowledgements);
  // 旧 cornix/ は消さない（ADR 0036）。
  strictEqual(await store.readText(legacyPath), plan.definitionText);
  strictEqual(await store.readText("cornix/labels.yaml"), labels);
});

test("cornix/の移行はkeymap.yamlを最後に書く", async () => {
  const { legacyPath, keymapText, store } = await legacyLayoutStore({
    "cornix/labels.yaml": "schema: cornix-bonsai/labels@2\nlayers:\nkeycodes:\n",
  });
  const parsed = parseKeymapYaml(keymapText);
  const migration = await planLayoutMigration(store, parsed.document, parsed.binding, webcrypto);
  const order: string[] = [];

  await writeLayoutMigration(
    { writeText: async (path: string) => void order.push(path) },
    migration!,
  );

  strictEqual(
    JSON.stringify(order),
    JSON.stringify([migration!.definitionPath, WORKSPACE_LAYOUT.labels, WORKSPACE_LAYOUT.keymap]),
  );
  notStrictEqual(migration!.definitionPath, legacyPath);
});

test("keysync/に既にあるsidecarは上書きしない", async () => {
  const { keymapText, store } = await legacyLayoutStore({
    "cornix/labels.yaml": 'schema: cornix-bonsai/labels@2\nlayers:\n  0: "Old"\nkeycodes:\n',
    "keysync/labels.yaml": 'schema: keysync/labels@2\nlayers:\n  0: "New"\nkeycodes:\n',
  });
  const parsed = parseKeymapYaml(keymapText);
  const migration = await planLayoutMigration(store, parsed.document, parsed.binding, webcrypto);

  strictEqual(migration?.copies.length, 0);
});

test("cornix/のdefinitionが無い、またはdigestが一致しなければ移行しない", async () => {
  const { legacyPath, keymapText } = await legacyLayoutStore();
  const parsed = parseKeymapYaml(keymapText);

  strictEqual(
    await planLayoutMigration(
      memoryStore({ [WORKSPACE_LAYOUT.keymap]: keymapText }),
      parsed.document,
      parsed.binding,
      webcrypto,
    ),
    undefined,
  );
  strictEqual(
    await planLayoutMigration(
      memoryStore({ [legacyPath]: `${DEFINITION.trim().slice(0, -1)}, "extra": 1 }` }),
      parsed.document,
      parsed.binding,
      webcrypto,
    ),
    undefined,
  );
});

test("keysync/を指すbindingは移行対象にしない", async () => {
  const plan = await planWorkspaceInit(DOCUMENT, DEFINITION, webcrypto);
  const store = memoryStore({ [plan.definitionPath]: plan.definitionText });
  const parsed = parseKeymapYaml(plan.keymapText);

  strictEqual(
    await planLayoutMigration(store, parsed.document, parsed.binding, webcrypto),
    undefined,
  );
});
