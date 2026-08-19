import { deepStrictEqual, rejects } from "node:assert/strict";
import { test } from "node:test";
import { parseAcknowledgements, serializeAcknowledgements } from "./acknowledgements.ts";

test("acknowledgementは重複を除いてstableに保存・復元する", () => {
  const text = serializeAcknowledgements(["warning-b", "warning-a", "warning-b"]);
  deepStrictEqual(parseAcknowledgements(text), ["warning-a", "warning-b"]);
});

test("acknowledgementの形式が壊れていれば読み込みを止める", async () => {
  await rejects(
    Promise.resolve().then(() => parseAcknowledgements('{"warning-a":true}')),
    /string array/,
  );
});
