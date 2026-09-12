import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseMacKeymapYaml } from "./parse.ts";
import { serializeMacKeymapYaml } from "./serialize.ts";
import { MacKeymapParseError, type MacKeymapDocument } from "./types.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/mac-keyboard");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

function layersOf(document: MacKeymapDocument): Record<number, Record<string, string>> {
  return Object.fromEntries(
    [...document.layers.entries()].map(([layer, assignments]) => [
      layer,
      Object.fromEntries(assignments),
    ]),
  );
}

test("desired.yaml を読むと疎な map になる", () => {
  const document = parseMacKeymapYaml(readFixture("desired.yaml"));
  strictEqual(document.profile, "Cornix Bonsai");
  strictEqual(document.layout, "jis");
  // 割り当ての無いキーは書かない。全キーを並べない（ADR 0022）。
  deepStrictEqual(layersOf(document), {
    0: {
      caps_lock: "LCTL_T(KC_ESC)",
      japanese_eisuu: "MO(2)",
      japanese_kana: "LT1(KC_LANG1)",
      right_command: "TG(3)",
    },
    1: {
      a: "KC_HOME",
      d: "KC_DEL",
      e: "KC_END",
      h: "KC_LEFT",
      j: "KC_DOWN",
      k: "KC_UP",
      l: "KC_RGHT",
    },
    2: {
      1: "KC_F1",
      2: "KC_F2",
      caps_lock: "LCTL_T(KC_ESC)",
      q: "KC_NO",
      w: "KC_TRNS",
    },
    3: { i: "KC_8", o: "KC_9", u: "KC_7" },
  });
});

test("desired.yaml は mac-keyboard.yaml を経由して round-trip する", () => {
  const document = parseMacKeymapYaml(readFixture("desired.yaml"));
  deepStrictEqual(parseMacKeymapYaml(serializeMacKeymapYaml(document)), document);
});

test("serialize は layer 昇順・key_code 名昇順で並べる", () => {
  const text = serializeMacKeymapYaml({
    layout: "jis",
    profile: "Cornix Bonsai",
    layers: new Map([
      [2, new Map([["z", "KC_Z"]])],
      [
        0,
        new Map([
          ["b", "KC_B"],
          ["a", "KC_A"],
        ]),
      ],
    ]),
  });
  strictEqual(
    text,
    [
      "schema: cornix-bonsai/mac-keymap@1",
      "layout: jis",
      'profile: "Cornix Bonsai"',
      "layers:",
      "  0:",
      '    "a": "KC_A"',
      '    "b": "KC_B"',
      "  2:",
      '    "z": "KC_Z"',
      "",
    ].join("\n"),
  );
});

test("layout を省略すると jis になる", () => {
  // 既存の mac-keyboard.yaml（layout 行なし）を壊さないための既定（ADR 0024）。
  const document = parseMacKeymapYaml(
    ["schema: cornix-bonsai/mac-keymap@1", 'profile: "x"', "layers:", "  0:"].join("\n"),
  );
  strictEqual(document.layout, "jis");
});

test("layout: ansi の document も round-trip する", () => {
  const document = parseMacKeymapYaml(
    [
      "schema: cornix-bonsai/mac-keymap@1",
      "layout: ansi",
      'profile: "x"',
      "layers:",
      "  0:",
      '    "a": "KC_A"',
    ].join("\n"),
  );
  strictEqual(document.layout, "ansi");
  deepStrictEqual(parseMacKeymapYaml(serializeMacKeymapYaml(document)), document);
});

test("未対応の layout は読まずに落ちる", () => {
  throws(
    () =>
      parseMacKeymapYaml(
        ["schema: cornix-bonsai/mac-keymap@1", "layout: iso", 'profile: "x"', "layers:"].join("\n"),
      ),
    MacKeymapParseError,
  );
});

test("layer 番号は連続していなくてよい", () => {
  const document = parseMacKeymapYaml(
    [
      "schema: cornix-bonsai/mac-keymap@1",
      'profile: "x"',
      "layers:",
      "  5:",
      '    "a": "KC_A"',
    ].join("\n"),
  );
  deepStrictEqual([...document.layers.keys()], [5]);
});

test("未対応の schema は読まずに落ちる", () => {
  throws(
    () => parseMacKeymapYaml('schema: cornix-bonsai/mac-keymap@2\nprofile: "x"\nlayers:\n'),
    MacKeymapParseError,
  );
});

test("解釈できない行は黙って捨てずに落ちる", () => {
  // 汎用の YAML parser ではない。serialize が出す部分集合だけを受ける（ADR 0009 と同じ理由）。
  throws(
    () =>
      parseMacKeymapYaml(
        [
          "schema: cornix-bonsai/mac-keymap@1",
          'profile: "x"',
          "layers:",
          "  0:",
          "    a: KC_A",
        ].join("\n"),
      ),
    MacKeymapParseError,
  );
});

test("同じ layer で key_code が重複したら落ちる", () => {
  throws(
    () =>
      parseMacKeymapYaml(
        [
          "schema: cornix-bonsai/mac-keymap@1",
          'profile: "x"',
          "layers:",
          "  0:",
          '    "a": "KC_A"',
          '    "a": "KC_B"',
        ].join("\n"),
      ),
    MacKeymapParseError,
  );
});

test("profile が無ければ落ちる", () => {
  throws(
    () => parseMacKeymapYaml("schema: cornix-bonsai/mac-keymap@1\nlayers:\n"),
    MacKeymapParseError,
  );
});
