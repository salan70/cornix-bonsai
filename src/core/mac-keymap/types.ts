/**
 * `mac-keyboard.yaml`（MacBook 内蔵キーボードの desired state）の型。
 *
 * ADR 0006 の「状態は `VilDocument` ただ 1 つ」は **Vial device の話**であり、Apple 製
 * キーボードには射影元の raw 層が存在しない。したがって `VilDocument` へ寄せず、
 * matrix・容量・definition digest という存在しない概念も持たない（ADR 0022）。
 *
 */

/** `mac-keyboard.yaml` の schema 識別子。互換性の無い変更でだけ上げる。 */
export const MAC_KEYMAP_SCHEMA = "cornix-bonsai/mac-keymap@1";

/**
 * Cornix Bonsai が所有する Karabiner profile の名前。
 *
 * `karabiner.json` の `profiles[]` のうち、この名前の 1 個だけを書き換える。
 * `global` と他の profile、`selected` には触らない（ADR 0022）。
 */
export const CORNIX_PROFILE_NAME = "Cornix Bonsai";

/**
 * layer 1 枚の割り当て。key は Karabiner の `key_code` 名、値は QMK 表記。
 *
 * **疎な map** である。Karabiner は書かれていないキーを素通しするため、割り当ての無い
 * キーを並べる必要が無い（ADR 0022）。
 */
export type MacLayerAssignments = ReadonlyMap<string, string>;

/**
 * `mac-keyboard.yaml` の内容。
 *
 * @doc docs/specs/mac-keymap.md#mackeymapdocument
 */
export interface MacKeymapDocument {
  /** 所有する Karabiner profile の名前。通常は `CORNIX_PROFILE_NAME`。 */
  readonly profile: string;
  /** layer 番号 → 割り当て。layer 番号も疎で、連続している必要は無い。 */
  readonly layers: ReadonlyMap<number, MacLayerAssignments>;
}

/** `mac-keyboard.yaml` が期待した形をしていないときに投げる。 */
export class MacKeymapParseError extends Error {}
