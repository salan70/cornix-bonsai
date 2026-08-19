/**
 * `.vil` の raw 層の型。
 *
 * ADR 0001 のとおり、この層は Vial が書き出した JSON を逐語で保持する責務だけを持つ。
 * keycode 文字列は正規化せず、入力された表記のまま置く。
 *
 */

/** Vial の `save_layout` が書き出す top-level key の順序（vial-gui: `keyboard_comm.py`）。 */
export const VIL_KEYS = [
  "version",
  "uid",
  "layout",
  "encoder_layout",
  "layout_options",
  "macro",
  "vial_protocol",
  "via_protocol",
  "tap_dance",
  "combo",
  "key_override",
  "alt_repeat_key",
  "settings",
] as const;

/**
 * keymap の 1 マス。keycode 文字列か、物理キーが存在しないことを示す `-1`。
 * `-1` は `KC_NO` とは別物で、`KC_NO` は「キーはあるが何も割り当てていない」を指す。
 */
export type VilKeyEntry = string | number;

/** `layout[layer][row][col]` */
export type VilLayout = readonly (readonly (readonly VilKeyEntry[])[])[];

/** `encoder_layout[layer][index][direction]`。direction 0 = 反時計回り（ADR 0003）。 */
export type VilEncoderLayout = readonly (readonly (readonly string[])[])[];

/** `tap_dance[index]` = `[tap, hold, double tap, hold after tap, timeout]` */
export type VilTapDanceEntry = readonly [string, string, string, string, number];

/** `combo[index]` = `[入力4, 出力1]` */
export type VilComboEntry = readonly [string, string, string, string, string];

/** raw 保持のための情報。key 順と、Cornix Bonsai が解釈しない未知 field。 */
export interface VilRaw {
  /** 元ファイルに現れた top-level key の順序。export で復元する。 */
  readonly keyOrder: readonly string[];
  /** `VIL_KEYS` にない top-level field。将来の Vial が足した設定を落とさないため保持する。 */
  readonly unknown: Readonly<Record<string, unknown>>;
}

/**
 * `.vil` を逐語保持した raw ドキュメント。
 *
 * `uid` は 64bit 整数で `JSON.parse` では桁落ちするため、**文字列として持つ**（ADR 0001）。
 *
 * @doc docs/specs/vil-document.md#vildocument
 */
export interface VilDocument {
  readonly version: number;
  readonly uid: string;
  readonly layout: VilLayout;
  readonly encoderLayout: VilEncoderLayout;
  readonly layoutOptions: number;
  readonly macro: readonly unknown[];
  readonly vialProtocol: number;
  readonly viaProtocol: number;
  readonly tapDance: readonly VilTapDanceEntry[];
  readonly combo: readonly VilComboEntry[];
  readonly keyOverride: readonly unknown[];
  readonly altRepeatKey: readonly unknown[];
  readonly settings: Readonly<Record<string, number>>;
  readonly raw: VilRaw;
}

/** `layout` の 1 マスが物理キーを持たない位置かどうか。 */
export function isAbsent(entry: VilKeyEntry): entry is number {
  return typeof entry === "number";
}
