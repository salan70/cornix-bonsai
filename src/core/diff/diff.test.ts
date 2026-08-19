import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseDefinition } from "../definition/parse.ts";
import { setKeyAssignment } from "../model/edit.ts";
import { parseVil } from "../vil/parse.ts";
import type { VilDocument } from "../vil/types.ts";
import { detectBulkChange, DEFAULT_BULK_CHANGE_THRESHOLD } from "./bulk-change.ts";
import { EMPTY_SETTINGS_VOCABULARY, describeSetting, type SettingsVocabulary } from "./describe.ts";
import { diffDocuments, type DiffEntry } from "./diff.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const definition = parseDefinition(readFixture("vial-definition-v1.12.json"));
const baseline = parseVil(readFixture("baseline.vil"));
const edgeCases = parseVil(readFixture("edge-cases.vil"));
const invalidCases = parseVil(readFixture("invalid-cases.vil"));

const at = (entries: readonly DiffEntry[], predicate: (entry: DiffEntry) => boolean) =>
  entries.filter(predicate);

test("同じ document どうしは差分ゼロ", () => {
  const diff = diffDocuments(baseline, baseline, definition);

  deepStrictEqual(diff.entries, []);
  strictEqual(diff.changedCount, 0);
  ok(diff.comparedCount > 0);
});

test("差分は raw で検出し、表示は挙動で出す", () => {
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "MO(2)");
  const diff = diffDocuments(baseline, after, definition);

  strictEqual(diff.entries.length, 1);
  const entry = diff.entries[0];
  strictEqual(entry?.change, "changed");
  strictEqual(entry.before, "KC_GESC");
  strictEqual(entry.after, "MO(2)");
  // raw keycode ではなく挙動として読める文字列が付く。
  strictEqual(entry.afterBehavior, "押している間だけ layer 2");
});

test("alias の書き換えは notationOnly で、変更件数に数えない", () => {
  // ADR 0001 が keycode を正規化せず保持すると決めているため、raw 比較だけでは
  // 表記の差が全部 diff に出る。alias 表で挙動が同じものを分離する。
  const before = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "KC_BSPACE");
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "KC_BSPC");
  const diff = diffDocuments(before, after, definition);

  strictEqual(diff.entries.length, 1);
  strictEqual(diff.entries[0]?.change, "notationOnly");
  strictEqual(diff.changedCount, 0);
  strictEqual(diff.notationOnlyCount, 1);
});

test("alias 表に無い表記は通常の変更として残る（取りこぼしは安全側へ倒す）", () => {
  const before = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "KC_A");
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "KC_B");
  const diff = diffDocuments(before, after, definition);

  strictEqual(diff.entries[0]?.change, "changed");
  strictEqual(diff.changedCount, 1);
});

test("KC_TRNS と KC_NO の違いを挙動として説明する", () => {
  const before = setKeyAssignment(baseline, { layer: 1, row: 0, col: 0 }, "KC_TRNS");
  const after = setKeyAssignment(baseline, { layer: 1, row: 0, col: 0 }, "KC_NO");
  const diff = diffDocuments(before, after, definition);

  strictEqual(diff.entries[0]?.beforeBehavior, "下の layer の割り当てを透過する");
  strictEqual(diff.entries[0]?.afterBehavior, "何も起きない");
});

test("USERnn は raw で比較し、表示だけ definition の title を使う", () => {
  // ADR 0002: 同じ USER01 が別の keycode を指す definition が実在する。
  // 表示名で比較すると definition を差し替えたときに「変更なし」と誤判定する。
  const before = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "USER00");
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "USER01");
  const diff = diffDocuments(before, after, definition);

  strictEqual(diff.entries[0]?.before, "USER00");
  strictEqual(diff.entries[0]?.beforeBehavior, "BT0（Bluetooth Channel 0）");
  strictEqual(diff.entries[0]?.afterBehavior, "BT1（Bluetooth Channel 1）");
});

test("definition に無い USERnn でも差分は消えない", () => {
  const before = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "USER00");
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "USER99");
  const diff = diffDocuments(before, after, definition);

  strictEqual(diff.entries.length, 1);
  strictEqual(diff.entries[0]?.afterBehavior, "USER99（この definition では未定義）");
});

test("settings は qsid の raw 値で比較し、辞書は表示にしか使わない", () => {
  const after: VilDocument = { ...baseline, settings: { ...baseline.settings, "2": 60 } };
  const vocabulary: SettingsVocabulary = { labels: new Map([[2, "Tapping Term"]]) };

  const withoutVocabulary = diffDocuments(baseline, after, definition);
  const withVocabulary = diffDocuments(baseline, after, definition, { settings: vocabulary });

  // 差分の件数は辞書の有無で変わらない。
  strictEqual(withoutVocabulary.entries.length, 1);
  strictEqual(withVocabulary.entries.length, 1);
  strictEqual(withoutVocabulary.entries[0]?.afterBehavior, "qsid 2: 60");
  strictEqual(withVocabulary.entries[0]?.afterBehavior, "Tapping Term: 60");
  strictEqual(describeSetting(999, 1, EMPTY_SETTINGS_VOCABULARY), "qsid 999: 1");
});

test("未知 field と layout_options も raw のまま差分に出る", () => {
  const after: VilDocument = {
    ...edgeCases,
    layoutOptions: 0,
    raw: { ...edgeCases.raw, unknown: { vendor_extension: { changed: true } } },
  };
  const diff = diffDocuments(edgeCases, after, definition);
  const fields = at(diff.entries, (entry) => entry.subject.kind === "field");

  strictEqual(fields.length, 2);
  ok(fields.some((entry) => entry.afterBehavior.includes("vendor_extension")));
});

test("tap dance と combo は entry 単位で比較し、挙動を並べる", () => {
  const after: VilDocument = {
    ...invalidCases,
    tapDance: [["KC_A", "KC_NO", "KC_B", "KC_NO", 200]],
  };
  const diff = diffDocuments(invalidCases, after, definition);
  const tapDance = at(diff.entries, (entry) => entry.subject.kind === "tapDance");

  strictEqual(tapDance.length, 1);
  ok(tapDance[0]?.afterBehavior.startsWith("tap: KC_A"));
});

test("大量変更は件数と割合の両方を満たすときだけ warning にする", () => {
  const after: VilDocument = {
    ...invalidCases,
    layout: invalidCases.layout.map((layer) => layer.map((row) => row.map(() => "KC_Z"))),
  };
  const diff = diffDocuments(invalidCases, after, definition);

  ok(diff.changedCount >= 5);
  const ratio = diff.changedCount / diff.comparedCount;
  ok(ratio > 0.5 && ratio < 0.9);

  // 割合を満たさない閾値では出ない。
  deepStrictEqual(
    detectBulkChange(diff, { minChangedEntries: 5, minChangedRatio: 0.9 }).map((d) => d.code),
    ["diff/layer-replaced", "diff/layer-replaced", "diff/layer-replaced"],
  );
  // 件数を満たさない閾値でも出ない。
  ok(
    !detectBulkChange(diff, { minChangedEntries: 100, minChangedRatio: 0.5 })
      .map((d) => d.code)
      .includes("diff/bulk-change"),
  );
  // 両方を満たしたときだけ出る。
  const both = detectBulkChange(diff, { minChangedEntries: 5, minChangedRatio: 0.5 });
  strictEqual(both.filter((d) => d.code === "diff/bulk-change").length, 1);
  strictEqual(both[0]?.severity, "warning");
});

test("1 件だけの変更では既定の閾値を超えない", () => {
  const after = setKeyAssignment(baseline, { layer: 0, row: 0, col: 0 }, "KC_Z");
  const diff = diffDocuments(baseline, after, definition);

  deepStrictEqual(detectBulkChange(diff, DEFAULT_BULK_CHANGE_THRESHOLD), []);
});

test("layer の全面置換は件数が閾値に届かなくても警告する", () => {
  const layout = invalidCases.layout.map((layer, index) =>
    index === 0 ? layer.map((row) => row.map(() => "KC_Z")) : layer,
  );
  const diff = diffDocuments(invalidCases, { ...invalidCases, layout }, definition);
  const replaced = detectBulkChange(diff).filter((d) => d.code === "diff/layer-replaced");

  strictEqual(replaced.length, 1);
  deepStrictEqual(replaced[0]?.subject, { kind: "layer", layer: 0 });
});
