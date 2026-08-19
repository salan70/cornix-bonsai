import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseDefinition, toPhysicalLayout } from "../definition/parse.ts";
import type { KeyboardDefinition } from "../definition/types.ts";
import { parseVil } from "../vil/parse.ts";
import { serializeVil } from "../vil/serialize.ts";
import { KeymapEditError, setEncoderAssignment, setKeyAssignment } from "./edit.ts";
import { buildKeymapView, readKeycode } from "./keymap-view.ts";
import { resolveLayoutOptions } from "./layout-options.ts";

const FIXTURES = join(import.meta.dirname, "../../../fixtures/cornix-lp");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const definition = parseDefinition(readFixture("vial-definition-v1.12.json"));
const baselineText = readFixture("baseline.vil").trimEnd();
const baseline = parseVil(baselineText);

test("Semantic View は物理キー × layer で構成される", () => {
  const view = buildKeymapView(baseline, definition);

  strictEqual(view.capacities.layerCount, 10);
  strictEqual(view.keys.length, 50 * 10);
  deepStrictEqual(view.orphanPositions, []);
  strictEqual(view.keyboardUid, "16882930253541522617");
});

test("encoder の direction 0 は反時計回りとして表現する", () => {
  const view = buildKeymapView(baseline, definition);
  const first = view.encoders.find((e) => e.layer === 0 && e.index === 0 && e.direction === "ccw");

  ok(first !== undefined);
  strictEqual(first.keycode, "KC_VOLD");
});

test("custom keycode が View 上で解決される", () => {
  const view = buildKeymapView(baseline, definition);
  const custom = view.keys.find((key) => key.resolved.kind === "custom");

  ok(custom !== undefined, "baseline に custom keycode が 1 つ以上ある");
  strictEqual(custom.keycode.startsWith("USER"), true);
});

test("definition に無い位置は落とさず orphanPositions に出す", () => {
  // definition のバージョン違いで位置が減ったケース。黙って捨ててはいけない。
  const reduced: KeyboardDefinition = {
    ...definition,
    layouts: {
      ...definition.layouts,
      keymap: (definition.layouts.keymap as unknown[]).slice(0, 1),
    },
  };
  const view = buildKeymapView(baseline, reduced);

  ok(view.orphanPositions.length > 0);
});

test("layout_options: Cornix LP は groups があるが gatesKeys は false", () => {
  // ADR 0002: labels は firmware version の表示に流用されているだけで、
  // 選択肢で出し分けられるキーは 1 つも無い。
  const options = resolveLayoutOptions(0, definition, toPhysicalLayout(definition));

  strictEqual(options.kind, "decoded");
  if (options.kind !== "decoded") return;
  strictEqual(options.gatesKeys, false);
  deepStrictEqual(options.groups, [{ index: 0, name: "Firmware Version", choices: ["V1.12"] }]);
});

test("layout_options: gate するキーがあれば gatesKeys が true になる", () => {
  // 「Cornix だから no-op」ではなく「gate するキーがゼロだから no-op」であることの証明。
  // 同じコードが別の definition では gate を検出する。
  const gated: KeyboardDefinition = {
    ...definition,
    layouts: {
      ...definition.layouts,
      // labels[8] に layout option を持つキーを 1 つ足す。
      // 既定の align=4 では LABEL_MAP[4][3] === 8 なので、生の label は 4 行目に置く。
      keymap: [["0,0\n\n\n0,1"]],
    },
  };
  const options = resolveLayoutOptions(0, gated, toPhysicalLayout(gated));

  strictEqual(options.kind, "decoded");
  if (options.kind !== "decoded") return;
  strictEqual(options.gatesKeys, true);
});

test("layout_options: -1 は「読まなかった」として 0 と区別する", () => {
  const edge = parseVil(readFixture("edge-cases.vil").trimEnd());
  strictEqual(edge.layoutOptions, -1);

  const options = resolveLayoutOptions(
    edge.layoutOptions,
    definition,
    toPhysicalLayout(definition),
  );
  strictEqual(options.kind, "unread");
});

test("編集は raw を返し、対象の位置だけが変わる", () => {
  const position = { layer: 0, row: 0, col: 1 };
  strictEqual(readKeycode(baseline, position), "KC_Q");

  const edited = setKeyAssignment(baseline, position, "KC_B");
  strictEqual(readKeycode(edited, position), "KC_B");
  // 元の document は変わらない（純関数）。
  strictEqual(readKeycode(baseline, position), "KC_Q");

  // 出力の差分はその 1 トークンぶんだけ。uid・key 順・他 field は無傷。
  const exported = serializeVil(edited);
  strictEqual(exported, baselineText.replace('"KC_Q"', '"KC_B"'));
  strictEqual(parseVil(exported).uid, baseline.uid);
});

test("物理キーの無い位置（-1）へは書けない", () => {
  // -1 は「キーが無い」で KC_NO は「割り当てが空」。混同すると definition と矛盾する。
  const absent = { layer: 0, row: 0, col: 6 };
  strictEqual(readKeycode(baseline, absent), undefined);

  throws(() => setKeyAssignment(baseline, absent, "KC_B"), KeymapEditError);
});

test("範囲外の位置へは書けない", () => {
  throws(() => setKeyAssignment(baseline, { layer: 99, row: 0, col: 0 }, "KC_B"), KeymapEditError);
});

test("encoderの編集は対象方向だけを差し替える", () => {
  const edited = setEncoderAssignment(baseline, { layer: 0, index: 0, direction: 0 }, "KC_A");

  strictEqual(edited.encoderLayout[0]?.[0]?.[0], "KC_A");
  strictEqual(edited.encoderLayout[0]?.[0]?.[1], "KC_VOLU");
  strictEqual(baseline.encoderLayout[0]?.[0]?.[0], "KC_VOLD");
});
