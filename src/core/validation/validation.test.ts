import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseDefinition } from "../definition/parse.ts";
import type { Capacities } from "../keycode/table.ts";
import { parseVil } from "../vil/parse.ts";
import type { VilDocument } from "../vil/types.ts";
import { validateDeviceMatch, type DeviceProfile } from "./compatibility.ts";
import { ApplyBlockedError, assertApplyAllowed, evaluateApplyGate } from "./gate.ts";
import { classifyKeycode } from "./keycode-vocabulary.ts";
import { analyzeReachability } from "./reachability.ts";
import { validateStructure } from "./structure.ts";
import { createDiagnostic, type Diagnostic } from "./types.ts";
import { validateKeymap } from "./validate.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const definition = parseDefinition(readFixture("vial-definition-v1.12.json"));
const baseline = parseVil(readFixture("baseline.vil"));
const edgeCases = parseVil(readFixture("edge-cases.vil"));
const invalidCases = parseVil(readFixture("invalid-cases.vil"));

const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map((d) => d.code);
const find = (diagnostics: readonly Diagnostic[], code: string) =>
  diagnostics.filter((d) => d.code === code);

test("baseline.vil は QMK 語彙をすべて解釈できる", () => {
  // docs/specs/semantic-model.md が D-003 へ送った「QMK の基本 keycode 語彙の網羅」の検証。
  // 実機 export の 119 種類が 1 つも unknown にならないことを語彙表の合格条件とする。
  const result = validateKeymap(baseline, definition);

  deepStrictEqual(find(result.diagnostics, "reference/unknown-keycode"), []);
});

test("baseline.vil は error も warning も出さず、Apply gate が開く", () => {
  // severity model は実 fixture で較正した。実機の export が既定で Apply を止めるなら、
  // その severity 割り当てが間違っている（ADR 0010）。
  const result = validateKeymap(baseline, definition);

  strictEqual(result.summary.error, 0);
  strictEqual(result.summary.warning, 0);
  ok(result.summary.information > 0);
  ok(evaluateApplyGate(result.diagnostics).allowed);
});

test("raw 保持の escape hatch は information にする", () => {
  const result = validateKeymap(edgeCases, definition);

  strictEqual(find(result.diagnostics, "structure/unknown-field-preserved").length, 1);
  strictEqual(find(result.diagnostics, "structure/layout-options-unread").length, 1);
  // 0x1234 は「読めたが挙動を追えない」。落としてはいないので information。
  strictEqual(find(result.diagnostics, "reference/numeric-keycode").length, 1);
});

test("matrix の形が definition と違えば error で、以降の位置比較は行わない", () => {
  const result = validateKeymap(edgeCases, definition);
  const mismatch = find(result.diagnostics, "compatibility/matrix-shape-mismatch");

  strictEqual(mismatch.length, 1);
  strictEqual(mismatch[0]?.severity, "error");
  // 座標の対応が未定義になるため、orphan / unassignable は出さない。
  deepStrictEqual(find(result.diagnostics, "compatibility/orphan-position"), []);
});

test("解決できない参照は warning で、Vial の無言の切り捨てを可視化する", () => {
  const result = validateKeymap(invalidCases, definition);

  strictEqual(find(result.diagnostics, "reference/out-of-range").length, 1);
  strictEqual(find(result.diagnostics, "reference/unknown-keycode").length, 1);
  strictEqual(find(result.diagnostics, "reference/undefined-custom-keycode").length, 1);
  strictEqual(find(result.diagnostics, "reference/empty-tap-dance").length, 1);
  for (const code of [
    "reference/out-of-range",
    "reference/unknown-keycode",
    "reference/undefined-custom-keycode",
  ]) {
    strictEqual(find(result.diagnostics, code)[0]?.severity, "warning");
  }
});

test("容量は実機の申告値で判定が変わる", () => {
  // ADR 0003: 容量は実機が申告する。`.vil` から観測した値を実機の容量として使わない。
  const capacities: Capacities = {
    layerCount: 10,
    macroCount: 32,
    tapDanceCount: 1,
    comboCount: 32,
  };
  const device: DeviceProfile = {
    keyboardUid: baseline.uid,
    capacities,
    supportedQsids: Object.keys(baseline.settings).map(Number),
  };

  // baseline は TD(1) を使う。実機が tap dance を 1 本しか持たなければ範囲外になる。
  const withDevice = validateKeymap(baseline, definition, device);
  const withoutDevice = validateKeymap(baseline, definition);

  ok(find(withDevice.diagnostics, "reference/out-of-range").length > 0);
  deepStrictEqual(find(withoutDevice.diagnostics, "reference/out-of-range"), []);
});

test("到達できない layer は information、出口の無い layer は warning", () => {
  const result = validateKeymap(invalidCases, definition);
  const unreachable = find(result.diagnostics, "reachability/unreachable-layer");
  const trapped = find(result.diagnostics, "reachability/trapped-layer");

  strictEqual(unreachable.length, 1);
  strictEqual(unreachable[0]?.severity, "information");
  strictEqual(trapped.length, 1);
  strictEqual(trapped[0]?.severity, "warning");
});

test("MO で入る layer は閉じ込めにならない", () => {
  // 押している間だけの遷移は離せば戻る。持続的な遷移だけが閉じ込めになりうる。
  const momentary = withLayout(invalidCases, [
    [
      ["MO(1)", "KC_A", "KC_B"],
      ["KC_C", "KC_D", "KC_E"],
    ],
    [
      ["KC_TRNS", "KC_TRNS", "KC_F"],
      ["KC_TRNS", "KC_TRNS", "KC_TRNS"],
    ],
  ]);
  const result = validateKeymap(momentary, definition);

  deepStrictEqual(find(result.diagnostics, "reachability/trapped-layer"), []);
  ok(analyzeReachability(momentary).reachable.has(1));
});

test("構造が壊れた .vil は error になる", () => {
  const broken = parseVil(
    JSON.stringify({
      version: 1,
      uid: 1,
      layout: [[["KC_A", "KC_B"]], [["KC_A"]]],
      encoder_layout: [[["KC_VOLD"]]],
      layout_options: 0,
      macro: [],
      vial_protocol: 6,
      via_protocol: 9,
      tap_dance: [["KC_A", "KC_B", "KC_C", "KC_D"]],
      combo: [["KC_A", "KC_B"]],
      key_override: [],
      alt_repeat_key: [],
      settings: { "2": -1 },
    }),
  );
  const diagnostics = validateStructure(broken);

  ok(diagnostics.every((diagnostic) => diagnostic.severity === "error"));
  ok(codes(diagnostics).includes("structure/layer-shape-mismatch"));
  ok(codes(diagnostics).includes("structure/invalid-encoder-entry"));
  ok(codes(diagnostics).includes("structure/invalid-tap-dance-entry"));
  ok(codes(diagnostics).includes("structure/invalid-combo-entry"));
  ok(codes(diagnostics).includes("structure/invalid-setting"));
});

test("実機との不一致は uid と容量が error、未対応 qsid が warning", () => {
  const device: DeviceProfile = {
    keyboardUid: "1",
    capacities: { layerCount: 2, macroCount: 1, tapDanceCount: 1, comboCount: 1 },
    supportedQsids: [2],
  };
  const diagnostics = validateDeviceMatch(invalidCases, device);

  strictEqual(find(diagnostics, "compatibility/uid-mismatch")[0]?.severity, "error");
  strictEqual(find(diagnostics, "compatibility/capacity-overflow")[0]?.severity, "error");
  strictEqual(find(diagnostics, "compatibility/unsupported-setting")[0]?.severity, "warning");
});

test("Apply gate: error は acknowledge できない", () => {
  const error = createDiagnostic("compatibility/uid-mismatch", "error", { kind: "document" }, "x");
  const gate = evaluateApplyGate([error], [error.id]);

  strictEqual(gate.allowed, false);
  deepStrictEqual(gate.acknowledgeable, []);
  throws(() => assertApplyAllowed(gate), ApplyBlockedError);
});

test("Apply gate: warning は acknowledge で越えられ、information は止めない", () => {
  const warning = createDiagnostic("reference/out-of-range", "warning", { kind: "document" }, "x");
  const info = createDiagnostic(
    "reachability/empty-layer",
    "information",
    { kind: "document" },
    "x",
  );

  strictEqual(evaluateApplyGate([warning, info]).allowed, false);
  strictEqual(evaluateApplyGate([warning, info], [warning.id]).allowed, true);
  strictEqual(evaluateApplyGate([info]).allowed, true);
});

test("acknowledge は根拠の値が変われば自動的に外れる", () => {
  const subject = { kind: "layer", layer: 1 } as const;
  const first = createDiagnostic("reference/out-of-range", "warning", subject, "x", { index: 9 });
  const second = createDiagnostic("reference/out-of-range", "warning", subject, "x", { index: 12 });

  strictEqual(evaluateApplyGate([first], [first.id]).allowed, true);
  // 同じ code・同じ位置でも、根拠が変われば別の診断として止め直す。
  strictEqual(evaluateApplyGate([second], [first.id]).allowed, false);
});

test("語彙表は alias と wrapper を構文だけで解く", () => {
  deepStrictEqual(classifyKeycode("KC_BSPC"), { kind: "basic", name: "KC_BSPC" });
  deepStrictEqual(classifyKeycode("LT1(KC_LANG2)"), {
    kind: "layerSwitch",
    action: "layerTap",
    layer: 1,
    inner: "KC_LANG2",
  });
  deepStrictEqual(classifyKeycode("LT(1, KC_LANG2)"), {
    kind: "layerSwitch",
    action: "layerTap",
    layer: 1,
    inner: "KC_LANG2",
  });
  deepStrictEqual(classifyKeycode("TO(3)"), {
    kind: "layerSwitch",
    action: "to",
    layer: 3,
    inner: undefined,
  });
  deepStrictEqual(classifyKeycode("SGUI_T(KC_S)"), {
    kind: "modTap",
    modifier: "SGUI",
    inner: "KC_S",
  });
  // definition を引数に取らないので、実在するかは判定しない（ADR 0002）。
  deepStrictEqual(classifyKeycode("USER99"), { kind: "custom", index: 99 });
  deepStrictEqual(classifyKeycode("KC_BOGUS"), { kind: "unknown", name: "KC_BOGUS" });
});

function withLayout(document: VilDocument, layout: string[][][]): VilDocument {
  return { ...document, layout, encoderLayout: [] };
}
