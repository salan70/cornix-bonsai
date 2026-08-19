/**
 * `.vil` テキスト → raw ドキュメント。
 */

import {
  VIL_KEYS,
  type VilComboEntry,
  type VilDocument,
  type VilEncoderLayout,
  type VilLayout,
  type VilTapDanceEntry,
} from "./types.ts";

/** `.vil` の内容が期待した形をしていないときに投げる。 */
export class VilParseError extends Error {}

/**
 * `.vil` のテキストを raw ドキュメントへ読み込む。
 *
 * `uid` は 64bit 整数で、素の `JSON.parse` に通すと桁落ちする
 * （実測 `16882930253541522617` → `16882930253541523000`）。そのため reviver の
 * 第 3 引数から**元のテキスト表記をそのまま取り出して文字列で保持する**（ADR 0001）。
 *
 * top-level の `uid` だけを対象にする。ネストした未知 field の中に `uid` があっても
 * 型を変えない（未知 field は解釈せず持ち回るのが ADR 0001 の前提のため）。
 *
 * 未知の top-level field と key 順は `raw` へ退避し、export で復元する。
 *
 * @doc docs/specs/vil-document.md#parsevil
 */
export function parseVil(text: string): VilDocument {
  let parsed: unknown;
  // reviver は葉から根へ走るため、root が確定するのは最後。holder の同一性で
  // top-level の uid を選び分けるために、候補をいったん全部ためておく。
  const uidCandidates: { holder: unknown; source: string }[] = [];

  try {
    parsed = JSON.parse(text, function (this: unknown, key, value, context?: { source?: string }) {
      if (key === "uid" && typeof value === "number" && context?.source !== undefined) {
        uidCandidates.push({ holder: this, source: context.source });
      }
      return value;
    });
  } catch (cause) {
    throw new VilParseError(`.vil を JSON として読めなかった: ${String(cause)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new VilParseError(".vil の top-level は object でなければならない");
  }

  const source = parsed as Record<string, unknown>;
  const uid = uidCandidates.find((candidate) => candidate.holder === source)?.source;
  if (uid === undefined) {
    throw new VilParseError('.vil の "uid" は number でなければならない');
  }

  const known = new Set<string>(VIL_KEYS);
  const keyOrder = Object.keys(source);
  const unknown: Record<string, unknown> = {};
  for (const key of keyOrder) {
    if (!known.has(key)) unknown[key] = source[key];
  }

  return {
    version: requireNumber(source, "version"),
    uid,
    layout: requireArray(source, "layout") as VilLayout,
    encoderLayout: requireArray(source, "encoder_layout") as VilEncoderLayout,
    layoutOptions: requireNumber(source, "layout_options"),
    macro: requireArray(source, "macro"),
    vialProtocol: requireNumber(source, "vial_protocol"),
    viaProtocol: requireNumber(source, "via_protocol"),
    tapDance: requireArray(source, "tap_dance") as readonly VilTapDanceEntry[],
    combo: requireArray(source, "combo") as readonly VilComboEntry[],
    keyOverride: requireArray(source, "key_override"),
    altRepeatKey: requireArray(source, "alt_repeat_key"),
    settings: requireSettings(source),
    raw: { keyOrder, unknown },
  };
}

function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number") {
    throw new VilParseError(`.vil の "${key}" は number でなければならない`);
  }
  return value;
}

function requireArray(source: Record<string, unknown>, key: string): readonly unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new VilParseError(`.vil の "${key}" は array でなければならない`);
  }
  return value;
}

/** `settings` は qsid の文字列を key に持つ object。値はすべて number。 */
function requireSettings(source: Record<string, unknown>): Readonly<Record<string, number>> {
  const value = source["settings"];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new VilParseError('.vil の "settings" は object でなければならない');
  }
  const settings: Record<string, number> = {};
  for (const [qsid, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "number") {
      throw new VilParseError(`.vil の settings["${qsid}"] は number でなければならない`);
    }
    settings[qsid] = raw;
  }
  return settings;
}
