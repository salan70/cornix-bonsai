/**
 * Semantic diff。
 *
 * **入力は 2 つの `VilDocument` と 1 つの keyboard definition**。definition が 1 つなのは
 * 意図的で、definition が違う 2 つの keymap を並べても `USERnn` の意味が食い違うため
 * 比較が成立しない（ADR 0002）。その組み合わせは diff ではなく
 * `validation/compatibility.ts` が診断として扱う。
 *
 * 比較は**すべて raw 表現**で行う（ADR 0001・0010）。semantic 表現は `describe.ts` が
 * 付ける説明文だけで、差分の有無を決めない。唯一の例外が alias の畳み込みで、
 * これは「表記だけの差」として分類するために使い、差分自体は消さずに残す。
 */

import type { KeyboardDefinition } from "../definition/types.ts";
import { createKeycodeTable, type Capacities, type KeycodeTable } from "../keycode/table.ts";
import { observeCapacities } from "../model/keymap-view.ts";
import { isAbsent, type VilDocument } from "../vil/types.ts";
import type { DiagnosticSubject } from "../validation/types.ts";
import { canonicalKeycode } from "../validation/keycode-vocabulary.ts";
import {
  describeKeycode,
  describeSetting,
  EMPTY_SETTINGS_VOCABULARY,
  type SettingsVocabulary,
} from "./describe.ts";

/**
 * 差分の種類。
 *
 * `notationOnly` は alias の書き換えなど**挙動が変わらない表記の差**。件数には数えるが、
 * 想定外の大量変更の判定（`bulk-change.ts`）からは外す。
 */
export type DiffChange = "added" | "removed" | "changed" | "notationOnly";

/** 差分 1 件。位置の型は診断と共有する（同じ位置を UI で突き合わせられるようにするため）。 */
export interface DiffEntry {
  readonly subject: DiagnosticSubject;
  readonly change: DiffChange;
  /** raw 表現。無い場合は空文字。 */
  readonly before: string;
  readonly after: string;
  /** 挙動としての説明。表示専用で、差分の判定には使わない。 */
  readonly beforeBehavior: string;
  readonly afterBehavior: string;
}

/** layer 単位の変更量。想定外の大量変更の判定に使う。 */
export interface LayerChangeCount {
  readonly assigned: number;
  readonly changed: number;
}

/** semantic diff の結果。 */
export interface KeymapDiff {
  readonly entries: readonly DiffEntry[];
  /** 挙動が変わった件数（`notationOnly` を含まない）。 */
  readonly changedCount: number;
  /** 表記だけが変わった件数。 */
  readonly notationOnlyCount: number;
  /** 比較した単位の総数。割合の分母。 */
  readonly comparedCount: number;
  readonly layers: ReadonlyMap<number, LayerChangeCount>;
}

/** diff の任意設定。 */
export interface DiffOptions {
  /** qsid の表示辞書。差分の判定には影響しない。 */
  readonly settings?: SettingsVocabulary;
  /** 実機の申告容量。省略時は `after` から観測する（ADR 0003）。 */
  readonly capacities?: Capacities;
}

/**
 * 2 つの `.vil` を意味の単位で比較する。
 *
 * @doc docs/specs/semantic-diff.md#diffdocuments
 */
export function diffDocuments(
  before: VilDocument,
  after: VilDocument,
  definition: KeyboardDefinition,
  options: DiffOptions = {},
): KeymapDiff {
  const capacities = options.capacities ?? observeCapacities(after);
  const table = createKeycodeTable(definition, capacities);
  const vocabulary = options.settings ?? EMPTY_SETTINGS_VOCABULARY;

  const entries: DiffEntry[] = [];
  const layers = new Map<number, { assigned: number; changed: number }>();
  let comparedCount = 0;

  const layerCount = Math.max(before.layout.length, after.layout.length);
  for (let layer = 0; layer < layerCount; layer++) {
    const stats = { assigned: 0, changed: 0 };
    const beforeLayer = before.layout[layer] ?? [];
    const afterLayer = after.layout[layer] ?? [];
    const rowCount = Math.max(beforeLayer.length, afterLayer.length);
    for (let row = 0; row < rowCount; row++) {
      const beforeRow = beforeLayer[row] ?? [];
      const afterRow = afterLayer[row] ?? [];
      const colCount = Math.max(beforeRow.length, afterRow.length);
      for (let col = 0; col < colCount; col++) {
        const beforeEntry = beforeRow[col];
        const afterEntry = afterRow[col];
        const beforeCode = beforeEntry === undefined || isAbsent(beforeEntry) ? "" : beforeEntry;
        const afterCode = afterEntry === undefined || isAbsent(afterEntry) ? "" : afterEntry;
        if (beforeCode === "" && afterCode === "") continue;

        comparedCount++;
        if (beforeCode !== "") stats.assigned++;
        if (beforeCode === afterCode) continue;

        const entry = keycodeEntry({ kind: "key", layer, row, col }, beforeCode, afterCode, table);
        entries.push(entry);
        if (entry.change !== "notationOnly") stats.changed++;
      }
    }
    layers.set(layer, stats);
  }

  const encoderLayerCount = Math.max(before.encoderLayout.length, after.encoderLayout.length);
  for (let layer = 0; layer < encoderLayerCount; layer++) {
    const beforeLayer = before.encoderLayout[layer] ?? [];
    const afterLayer = after.encoderLayout[layer] ?? [];
    const count = Math.max(beforeLayer.length, afterLayer.length);
    for (let index = 0; index < count; index++) {
      for (const direction of [0, 1] as const) {
        const beforeCode = beforeLayer[index]?.[direction] ?? "";
        const afterCode = afterLayer[index]?.[direction] ?? "";
        if (beforeCode === "" && afterCode === "") continue;
        comparedCount++;
        if (beforeCode === afterCode) continue;
        entries.push(
          keycodeEntry(
            { kind: "encoder", layer, index, direction: direction === 0 ? "ccw" : "cw" },
            beforeCode,
            afterCode,
            table,
          ),
        );
      }
    }
  }

  const tapDanceCount = Math.max(before.tapDance.length, after.tapDance.length);
  for (let index = 0; index < tapDanceCount; index++) {
    const beforeText = formatTapDance(before.tapDance[index]);
    const afterText = formatTapDance(after.tapDance[index]);
    if (beforeText === "" && afterText === "") continue;
    comparedCount++;
    if (beforeText === afterText) continue;
    entries.push({
      subject: { kind: "tapDance", index },
      change: classify(beforeText, afterText),
      before: beforeText,
      after: afterText,
      beforeBehavior: describeTapDance(before.tapDance[index], table),
      afterBehavior: describeTapDance(after.tapDance[index], table),
    });
  }

  const comboCount = Math.max(before.combo.length, after.combo.length);
  for (let index = 0; index < comboCount; index++) {
    const beforeCombo = before.combo[index];
    const afterCombo = after.combo[index];
    const beforeText = beforeCombo === undefined ? "" : beforeCombo.join(" + ");
    const afterText = afterCombo === undefined ? "" : afterCombo.join(" + ");
    if (beforeText === "" && afterText === "") continue;
    comparedCount++;
    if (beforeText === afterText) continue;
    entries.push({
      subject: { kind: "combo", index },
      change: classify(beforeText, afterText),
      before: beforeText,
      after: afterText,
      beforeBehavior: describeCombo(beforeCombo, table),
      afterBehavior: describeCombo(afterCombo, table),
    });
  }

  for (const qsid of unionKeys(before.settings, after.settings)) {
    const beforeValue = before.settings[qsid];
    const afterValue = after.settings[qsid];
    comparedCount++;
    if (beforeValue === afterValue) continue;
    entries.push({
      subject: { kind: "setting", qsid: Number(qsid) },
      change: classify(stringify(beforeValue), stringify(afterValue)),
      before: stringify(beforeValue),
      after: stringify(afterValue),
      beforeBehavior: describeSetting(Number(qsid), beforeValue, vocabulary),
      afterBehavior: describeSetting(Number(qsid), afterValue, vocabulary),
    });
  }

  const macroCount = Math.max(before.macro.length, after.macro.length);
  for (let index = 0; index < macroCount; index++) {
    const beforeText = stringifyJson(before.macro[index]);
    const afterText = stringifyJson(after.macro[index]);
    if (beforeText === afterText) continue;
    comparedCount++;
    entries.push({
      subject: { kind: "macro", index },
      change: classify(beforeText, afterText),
      before: beforeText,
      after: afterText,
      // macro は write 経路を持たず（ADR 0005）、意味解釈も未実装なので raw のまま出す。
      beforeBehavior: `macro ${index}（raw）`,
      afterBehavior: `macro ${index}（raw）`,
    });
  }

  if (before.layoutOptions !== after.layoutOptions) {
    entries.push({
      subject: { kind: "field", name: "layout_options" },
      change: "changed",
      before: String(before.layoutOptions),
      after: String(after.layoutOptions),
      beforeBehavior: `layout_options: ${before.layoutOptions}`,
      afterBehavior: `layout_options: ${after.layoutOptions}`,
    });
    comparedCount++;
  }

  for (const name of unionKeys(before.raw.unknown, after.raw.unknown)) {
    const beforeText = stringifyJson(before.raw.unknown[name]);
    const afterText = stringifyJson(after.raw.unknown[name]);
    comparedCount++;
    if (beforeText === afterText) continue;
    entries.push({
      subject: { kind: "field", name },
      change: classify(beforeText, afterText),
      before: beforeText,
      after: afterText,
      // 未知 field は解釈しない（ADR 0001）。差分の有無だけを raw で示す。
      beforeBehavior: `未知 field "${name}"（raw）`,
      afterBehavior: `未知 field "${name}"（raw）`,
    });
  }

  const notationOnlyCount = entries.filter((entry) => entry.change === "notationOnly").length;

  return {
    entries,
    changedCount: entries.length - notationOnlyCount,
    notationOnlyCount,
    comparedCount,
    layers,
  };
}

function keycodeEntry(
  subject: DiagnosticSubject,
  before: string,
  after: string,
  table: KeycodeTable,
): DiffEntry {
  return {
    subject,
    change: classifyKeycodeChange(before, after),
    before,
    after,
    beforeBehavior: before === "" ? "（無し）" : describeKeycode(before, table),
    afterBehavior: after === "" ? "（無し）" : describeKeycode(after, table),
  };
}

/** alias の差だけなら `notationOnly`。alias 表に無い表記は通常の変更として残る。 */
function classifyKeycodeChange(before: string, after: string): DiffChange {
  if (before !== "" && after !== "" && canonicalKeycode(before) === canonicalKeycode(after)) {
    return "notationOnly";
  }
  return classify(before, after);
}

function classify(before: string, after: string): DiffChange {
  if (before === "") return "added";
  if (after === "") return "removed";
  return "changed";
}

function unionKeys(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
}

function stringify(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function stringifyJson(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function formatTapDance(entry: readonly (string | number)[] | undefined): string {
  return entry === undefined ? "" : entry.join(" / ");
}

function describeTapDance(
  entry: readonly (string | number)[] | undefined,
  table: KeycodeTable,
): string {
  if (entry === undefined) return "（無し）";
  const [tap, hold, doubleTap, holdAfterTap, timeout] = entry;
  const label = (value: string | number | undefined): string =>
    typeof value === "string" ? describeKeycode(value, table) : "（無し）";
  return `tap: ${label(tap)} / hold: ${label(hold)} / 2 度押し: ${label(doubleTap)} / tap 後 hold: ${label(holdAfterTap)} / ${String(timeout ?? "")}ms`;
}

function describeCombo(entry: readonly string[] | undefined, table: KeycodeTable): string {
  if (entry === undefined) return "（無し）";
  const inputs = entry
    .slice(0, 4)
    .filter((keycode) => keycode !== "KC_NO")
    .map((keycode) => describeKeycode(keycode, table));
  const output = entry[4];
  if (inputs.length === 0) return "（無し）";
  return `${inputs.join(" + ")} → ${output === undefined ? "（無し）" : describeKeycode(output, table)}`;
}
