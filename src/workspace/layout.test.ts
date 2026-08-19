import { deepStrictEqual, rejects } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { definitionPath, readDefinitionBinding, sha256Hex } from "./layout.ts";

test("definition bindingはpathと内容のdigestを検証する", async () => {
  const bytes = new TextEncoder().encode('{"name":"Cornix LP"}\n');
  const digest = await sha256Hex(bytes, webcrypto);
  const path = definitionPath(digest);
  const store = {
    readBytes: async (requested: string) => (requested === path ? bytes : undefined),
  };

  deepStrictEqual(
    await readDefinitionBinding(store, path, digest, webcrypto),
    '{"name":"Cornix LP"}\n',
  );
});

test("改変されたdefinitionはbindingから読み込まない", async () => {
  const original = new TextEncoder().encode('{"name":"Cornix LP"}\n');
  const modified = new TextEncoder().encode('{"name":"Other keyboard"}\n');
  const digest = await sha256Hex(original, webcrypto);
  const path = definitionPath(digest);
  const store = { readBytes: async () => modified };

  await rejects(
    readDefinitionBinding(store, path, digest, webcrypto),
    /definition digestが一致しない/,
  );
});
