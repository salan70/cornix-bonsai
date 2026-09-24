import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseVil } from "../core/vil/parse.ts";
import { editComboField, editSettingValue, editTapDanceField } from "./behavior-edit.ts";

const document = parseVil(
  readFileSync(join(import.meta.dirname, "../../fixtures/cornix-lp/baseline.vil"), "utf8"),
);

test("Tap Danceのtimeoutは0〜65535の整数だけを保存する", () => {
  for (const value of ["-1", "65536", "1.5", "abc", ""]) {
    const result = editTapDanceField(document, 0, 4, value);
    strictEqual(result.kind, "invalid", value);
  }
  const result = editTapDanceField(document, 0, 4, "65535");
  ok(result.kind === "ok");
  strictEqual(result.document.tapDance[0]?.[4], 65535);
  deepStrictEqual(result.document.tapDance[1], document.tapDance[1]);
});

test("Tap Danceのkeycode fieldはそのまま書き換え、範囲外のfieldは無視する", () => {
  const result = editTapDanceField(document, 0, 1, "KC_LSHIFT");
  ok(result.kind === "ok");
  strictEqual(result.document.tapDance[0]?.[1], "KC_LSHIFT");
  strictEqual(editTapDanceField(document, 0, 5, "KC_A").kind, "unchanged");
  strictEqual(editTapDanceField(document, 999, 0, "KC_A").kind, "unchanged");
});

test("Comboは入力4つと出力1つを書き換える", () => {
  const result = editComboField(document, 0, 4, "KC_ESCAPE");
  ok(result.kind === "ok");
  strictEqual(result.document.combo[0]?.[4], "KC_ESCAPE");
  strictEqual(editComboField(document, 0, -1, "KC_A").kind, "unchanged");
});

test("settingは0〜65535の整数だけを保存する", () => {
  strictEqual(editSettingValue(document, 7, "70000").kind, "invalid");
  const result = editSettingValue(document, 7, "200");
  ok(result.kind === "ok");
  strictEqual(result.document.settings["7"], 200);
});
