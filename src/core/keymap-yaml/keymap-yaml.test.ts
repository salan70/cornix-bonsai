import { deepStrictEqual, match, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseVil } from "../vil/parse.ts";
import { serializeVil } from "../vil/serialize.ts";
import type { VilDocument } from "../vil/types.ts";
import { parseKeymapYaml } from "./parse.ts";
import { serializeKeymapYaml } from "./serialize.ts";
import { KeymapYamlParseError, type DefinitionBinding } from "./types.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8").trimEnd();

/** ADR 0007 が決めた対応づけ。digest は fixture definition の canonical 表現の SHA-256。 */
const BINDING: DefinitionBinding = {
  keyboardUid: "16882930253541522617",
  keyboardName: "Cornix LP",
  definitionPath: "cornix/definitions/2e27d796fea0183f.json",
  definitionDigest: "2e27d796fea0183fb5aa7d7ada154089cf1b7aaf17c72d0a3e4c781161af0d78",
};

const bindingFor = (document: VilDocument): DefinitionBinding => ({
  ...BINDING,
  keyboardUid: document.uid,
});

test("baseline.vil は keymap.yaml を経由して round-trip する", () => {
  const document = parseVil(readFixture("baseline.vil"));
  const parsed = parseKeymapYaml(serializeKeymapYaml(document, bindingFor(document)));

  deepStrictEqual(parsed.document, document);
  deepStrictEqual(parsed.binding, bindingFor(document));
});

test("edge-cases.vil も keymap.yaml を経由して round-trip する", () => {
  // 未知の top-level field、ネストした未知 field、`layout_options: -1`、
  // hex 表記の keycode、非 ASCII の macro text。ADR 0001 の escape hatch がここに集まる。
  const document = parseVil(readFixture("edge-cases.vil"));
  deepStrictEqual(
    parseKeymapYaml(serializeKeymapYaml(document, bindingFor(document))).document,
    document,
  );
});

test("keymap.yaml 経由の round-trip は `.vil` の round-trip と合成できる", () => {
  // keymap.yaml が第 2 のモデルなら、ここで `.vil` の byte 一致が壊れる（ADR 0009）。
  const text = readFixture("baseline.vil");
  const document = parseVil(text);
  const viaYaml = parseKeymapYaml(serializeKeymapYaml(document, bindingFor(document))).document;

  strictEqual(serializeVil(viaYaml), text);
});

test("keycode は必ず引用し、物理キー無しの -1 は数値のまま置く", () => {
  // 引用しないと YAML が hex 表記の keycode を整数として読む（D-002 Spike）。
  // `-1`（物理キーが無い）と `KC_NO`（キーはあるが未割り当て）は別物なので、
  // 表現の型も分けたままにする。
  const document = parseVil(readFixture("edge-cases.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document));

  ok(yaml.includes('"0x1234"'));
  ok(yaml.includes('["KC_A", -1]'));
  ok(yaml.includes('["KC_NO", "0x1234"]'));
});

test("1 キーの変更は 1 行の diff になる", () => {
  // Git diff の読みやすさが schema の採用理由なので、契約として test に置く。
  const document = parseVil(readFixture("baseline.vil"));
  const before = serializeKeymapYaml(document, bindingFor(document)).split("\n");

  const layout = document.layout.map((layer, layerIndex) =>
    layerIndex !== 0
      ? layer
      : layer.map((row, rowIndex) =>
          rowIndex !== 0 ? row : row.map((entry, colIndex) => (colIndex === 1 ? "KC_ESC" : entry)),
        ),
  );
  const after = serializeKeymapYaml({ ...document, layout }, bindingFor(document)).split("\n");

  strictEqual(before.length, after.length);
  strictEqual(before.filter((line, index) => line !== after[index]).length, 1);
});

test("comment は注記であって状態ではない", () => {
  // 注記に意味を持たせると keymap.yaml が第 2 の状態になる（ADR 0006 / 0009）。
  // 人間や AI が足した comment を混ぜても、読み取り結果は変わらない。
  const document = parseVil(readFixture("baseline.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document));
  const annotated = yaml
    .split("\n")
    .flatMap((line) => (line.startsWith("  - - ") ? ["  # 左手 上段", line] : [line]))
    .join("\n");

  deepStrictEqual(parseKeymapYaml(annotated).document, parseKeymapYaml(yaml).document);
});

test("未知の schema は読まずに落とす", () => {
  const document = parseVil(readFixture("baseline.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document)).replace(
    "cornix-bonsai/keymap@1",
    "cornix-bonsai/keymap@2",
  );

  throws(() => parseKeymapYaml(yaml), KeymapYamlParseError);
});

test("受け付ける部分集合の外は黙って読まずに落とす", () => {
  // 汎用 YAML parser ではないことがそのまま安全側の性質になる（ADR 0009）。
  // block style で書き直した row は、読み違えるのではなく error になる。
  const document = parseVil(readFixture("baseline.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document)).replace(
    '  - - ["KC_GESC"',
    '  - - - "KC_GESC"\n    - ["KC_GESC"',
  );

  throws(() => parseKeymapYaml(yaml), KeymapYamlParseError);
});

test("引用の無い keycode は文字列として読まずに落とす", () => {
  const document = parseVil(readFixture("baseline.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document)).replace(
    '  uid: "16882930253541522617"',
    "  uid: 16882930253541522617",
  );

  throws(
    () => parseKeymapYaml(yaml),
    (error: unknown) => {
      ok(error instanceof KeymapYamlParseError);
      match(error.message, /keyboard\.uid/);
      return true;
    },
  );
});

test("tapDance の arity 違反は落とす", () => {
  const document = parseVil(readFixture("edge-cases.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document)).replace(
    '["KC_LANG1", "KC_NO", "KC_LANG2", "KC_NO", 200]',
    '["KC_LANG1", "KC_NO", "KC_LANG2", "KC_NO"]',
  );

  throws(() => parseKeymapYaml(yaml), KeymapYamlParseError);
});

test("raw.json の後に余分な行があれば落とす", () => {
  // 解釈しない field を JSON 塊で持つため、その塊の外に何かあると往復が壊れる。
  const document = parseVil(readFixture("baseline.vil"));
  const yaml = serializeKeymapYaml(document, bindingFor(document)) + "extra: 1\n";

  throws(() => parseKeymapYaml(yaml), KeymapYamlParseError);
});
