import { deepStrictEqual, notStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseVil, VilParseError } from "./parse.ts";
import { serializeVil } from "./serialize.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8").trimEnd();

test("baseline.vil は byte 一致で round-trip する", () => {
  const text = readFixture("baseline.vil");
  strictEqual(serializeVil(parseVil(text)), text);
});

test("edge-cases.vil は意味 round-trip する（byte 一致は保証しない）", () => {
  // ADR 0001: 保証するのは意味 round-trip であって byte 一致ではない。
  // edge-cases.vil は python が `1000.0` と書く数値を含むため byte 一致しない。
  const document = parseVil(readFixture("edge-cases.vil"));
  deepStrictEqual(parseVil(serializeVil(document)), document);
});

test("uid は 64bit のまま文字列で保持される", () => {
  const text = readFixture("baseline.vil");
  const document = parseVil(text);

  strictEqual(document.uid, "16882930253541522617");
  // 素の JSON.parse では桁落ちする。この差がまさに保持機構が効いている証拠。
  notStrictEqual(String((JSON.parse(text) as { uid: number }).uid), document.uid);
});

test("ネストした uid は文字列化しない", () => {
  // 未知 field は解釈せず持ち回るのが前提なので、中の uid の型を変えてはいけない。
  const document = parseVil(
    '{"version": 1, "uid": 12, "layout": [], "encoder_layout": [], "layout_options": 0,' +
      ' "macro": [], "vial_protocol": 6, "via_protocol": 9, "tap_dance": [], "combo": [],' +
      ' "key_override": [], "alt_repeat_key": [], "settings": {}, "vendor": {"uid": 5}}',
  );
  strictEqual(document.uid, "12");
  deepStrictEqual(document.raw.unknown["vendor"], { uid: 5 });
});

test("未知の top-level field とネストした未知 field を落とさない", () => {
  const document = parseVil(readFixture("edge-cases.vil"));

  ok("vendor_extension" in document.raw.unknown);
  const exported = serializeVil(document);
  ok(exported.includes("vendor_extension"));
  // key_override の中の未知 field も残る。
  ok(exported.includes("future_field"));
});

test("top-level が object でない .vil は拒否する", () => {
  throws(() => parseVil("[]"), VilParseError);
});
