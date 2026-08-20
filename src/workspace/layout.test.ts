import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { definitionDigest, definitionPath, readDefinitionBinding } from "./layout.ts";

test("definition bindingはpathと内容のdigestを検証する", async () => {
  const bytes = new TextEncoder().encode('{"name":"Cornix LP"}\n');
  const digest = await definitionDigest(new TextDecoder().decode(bytes), webcrypto);
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
  const modified = new TextEncoder().encode('{"name":"Other keyboard"}\n');
  const digest = await definitionDigest('{"name":"Cornix LP"}\n', webcrypto);
  const path = definitionPath(digest);
  const store = { readBytes: async () => modified };

  await rejects(
    readDefinitionBinding(store, path, digest, webcrypto),
    /definition digestが一致しない/,
  );
});

test("整形とキー順が違う同じdefinitionは同じbindingになる", async () => {
  const compact = '{"name":"Cornix LP","matrix":{"rows":8,"cols":7}}';
  const pretty = '{\n  "matrix": { "cols": 7, "rows": 8 },\n  "name": "Cornix LP"\n}\n';

  const digest = await definitionDigest(compact, webcrypto);
  strictEqual(await definitionDigest(pretty, webcrypto), digest);

  // 実機readとCLI importが別の整形で保存しても、bindingは同じpathとdigestを指す。
  const path = definitionPath(digest);
  const store = { readBytes: async () => new TextEncoder().encode(pretty) };
  strictEqual(await readDefinitionBinding(store, path, digest, webcrypto), pretty);
});
