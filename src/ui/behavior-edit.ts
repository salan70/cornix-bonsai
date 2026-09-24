import type { VilDocument } from "../core/vil/types.ts";

/** 動作定義の編集結果。範囲外の値は文書を変えずに理由だけを返す。 */
export type BehaviorEdit =
  | { readonly kind: "ok"; readonly document: VilDocument }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "unchanged" };

const U16_MAX = 0xffff;

/**
 * Tap Dance の 1 field を書き換える。field 0〜3 は keycode、4 は timeout（0〜65535 の整数）。
 *
 * @doc docs/specs/ui.md#behaviors-and-references
 */
export function editTapDanceField(
  document: VilDocument,
  index: number,
  field: number,
  value: string,
): BehaviorEdit {
  const current = document.tapDance[index];
  if (current === undefined || field < 0 || field > 4) return { kind: "unchanged" };
  const next = [...current] as [string, string, string, string, number];
  if (field === 4) {
    const timeout = parseU16(value);
    if (timeout === undefined)
      return { kind: "invalid", message: "Tap Dance timeoutは0〜65535の整数が必要" };
    next[4] = timeout;
  } else next[field] = value;
  return {
    kind: "ok",
    document: {
      ...document,
      tapDance: document.tapDance.map((entry, entryIndex) => (entryIndex === index ? next : entry)),
    },
  };
}

/**
 * Combo の 1 field（入力 4 つと出力 1 つ）を書き換える。
 *
 * @doc docs/specs/ui.md#behaviors-and-references
 */
export function editComboField(
  document: VilDocument,
  index: number,
  field: number,
  value: string,
): BehaviorEdit {
  const current = document.combo[index];
  if (current === undefined || field < 0 || field > 4) return { kind: "unchanged" };
  const next = [...current] as [string, string, string, string, string];
  next[field] = value;
  return {
    kind: "ok",
    document: {
      ...document,
      combo: document.combo.map((entry, entryIndex) => (entryIndex === index ? next : entry)),
    },
  };
}

/**
 * qsid の設定値を書き換える。値は 0〜65535 の整数に限る。
 *
 * @doc docs/specs/ui.md#behaviors-and-references
 */
export function editSettingValue(document: VilDocument, qsid: number, value: string): BehaviorEdit {
  const parsed = parseU16(value);
  if (parsed === undefined) return { kind: "invalid", message: "settingは0〜65535の整数が必要" };
  return {
    kind: "ok",
    document: { ...document, settings: { ...document.settings, [String(qsid)]: parsed } },
  };
}

function parseU16(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= U16_MAX ? parsed : undefined;
}
