/**
 * raw ドキュメント → `.vil` テキスト。
 *
 * ADR 0001 が保証するのは意味 round-trip であって byte 一致ではない。
 * ただし差分を読める状態に保つため、Vial（python `json.dumps` 既定）の書式へ寄せる。
 *
 */

import type { VilDocument } from "./types.ts";

/** raw ドキュメントを `.vil` の dict へ戻す。元ファイルの key 順を再現する。 */
export function toVilObject(document: VilDocument): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    version: document.version,
    uid: document.uid,
    layout: document.layout,
    encoder_layout: document.encoderLayout,
    layout_options: document.layoutOptions,
    macro: document.macro,
    vial_protocol: document.vialProtocol,
    via_protocol: document.viaProtocol,
    tap_dance: document.tapDance,
    combo: document.combo,
    key_override: document.keyOverride,
    alt_repeat_key: document.altRepeatKey,
    settings: document.settings,
    ...document.raw.unknown,
  };

  const ordered: Record<string, unknown> = {};
  for (const key of document.raw.keyOrder) {
    if (key in fields) ordered[key] = fields[key];
  }
  // 元ファイルに無かった key（raw を経由せず組み立てた場合）は末尾へ回す。
  for (const key of Object.keys(fields)) {
    if (!(key in ordered)) ordered[key] = fields[key];
  }
  return ordered;
}

/**
 * `.vil` テキストへ書き出す。
 *
 * `uid` は raw 層では文字列で持っているが、`.vil` 上は数値なので引用符を外して戻す。
 *
 * @doc docs/specs/vil-document.md#serializevil
 */
export function serializeVil(document: VilDocument): string {
  return dumpPythonJson(toVilObject(document)).replace(/"uid": "(\d+)"/, '"uid": $1');
}

/**
 * python の `json.dumps(obj)` 既定相当の文字列化。
 *
 * 区切りは `", "` と `": "`、非 ASCII は `\uXXXX` へエスケープする（`ensure_ascii=True`）。
 */
function dumpPythonJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(dumpPythonJson).join(", ")}]`;
  if (typeof value === "object") {
    const body = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${escapeNonAscii(JSON.stringify(key))}: ${dumpPythonJson(item)}`)
      .join(", ");
    return `{${body}}`;
  }
  return escapeNonAscii(JSON.stringify(value));
}

function escapeNonAscii(text: string): string {
  return text.replace(
    /[\u0080-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
