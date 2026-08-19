/**
 * 正規化テーブル。
 *
 * ADR 0001・0002・0003 がそれぞれ「正規化テーブルの単一の定義元が要る」を D-001 の入力として
 * 先送りしていた。その定義元がここ。
 *
 * **モジュール定数にできない**。理由は 2 つある。
 *   - custom keycode の意味は definition の定義順で決まる（ADR 0002）。同じ `USER01` が
 *     別の keycode を指す definition が実在する
 *   - `MO(n)` / `LT n(kc)` / `TD(n)` / `M(n)` の語彙は layer 数・tap dance 数・macro 数から
 *     生成される。これらの容量は実機が申告するもので、firmware ごとに違う（ADR 0003）
 *
 * したがってテーブルは definition と容量を引数に取る factory で作る。
 *
 */

import type { KeyboardDefinition } from "../definition/types.ts";

/**
 * 実機が申告する容量（ADR 0003）。
 *
 * `.vil` や definition から代用してはいけない。ここでは `.vil` から組み立てる経路も許すが、
 * 実機 Apply の経路では必ず実機の申告値を使う。
 */
export interface Capacities {
  readonly layerCount: number;
  readonly macroCount: number;
  readonly tapDanceCount: number;
  readonly comboCount: number;
}

/** `USERnn` が指す custom keycode。`index` が definition の定義順。 */
export interface ResolvedCustomKeycode {
  readonly kind: "custom";
  readonly index: number;
  readonly name: string;
  readonly title: string;
  readonly shortName: string;
}

/** keycode 文字列を解釈した結果。 */
export type ResolvedKeycode =
  | ResolvedCustomKeycode
  | { readonly kind: "layerMomentary"; readonly layer: number }
  | { readonly kind: "layerTap"; readonly layer: number; readonly inner: string }
  | { readonly kind: "tapDance"; readonly index: number }
  | { readonly kind: "macro"; readonly index: number }
  | { readonly kind: "none" }
  | { readonly kind: "transparent" }
  | { readonly kind: "basic"; readonly name: string }
  /** 語彙には合うが容量の範囲外。Vial は無言で `KC_NO` などへ落とす（ADR 0001）。 */
  | { readonly kind: "outOfRange"; readonly name: string; readonly index: number };

/**
 * definition と容量から作る keycode の解釈テーブル。
 *
 * 最小実装の範囲では「definition 依存の語彙を definition 依存として解けること」までを担う。
 * QMK の基本 keycode 語彙を網羅した表は持たず、`basic` として素通しする。網羅は D-003 で扱う。
 */
export interface KeycodeTable {
  readonly capacities: Capacities;
  /** keycode 文字列を解釈する。 */
  resolve(keycode: string): ResolvedKeycode;
  /** definition が宣言する custom keycode の一覧。添字が `USERnn` の `nn`。 */
  readonly customKeycodes: readonly ResolvedCustomKeycode[];
}

const CUSTOM_PATTERN = /^USER(\d{2})$/;
const MOMENTARY_PATTERN = /^MO\((\d+)\)$/;
const LAYER_TAP_PATTERN = /^LT(\d+)\((.+)\)$/;
const TAP_DANCE_PATTERN = /^TD\((\d+)\)$/;
const MACRO_PATTERN = /^M\((\d+)\)$/;

/** definition と実機申告の容量から正規化テーブルを作る。  *
 * @doc docs/specs/semantic-model.md#createkeycodetable
 */
export function createKeycodeTable(
  definition: KeyboardDefinition,
  capacities: Capacities,
): KeycodeTable {
  const customKeycodes: readonly ResolvedCustomKeycode[] = definition.customKeycodes.map(
    (custom, index) => ({
      kind: "custom",
      index,
      name: custom.name,
      title: custom.title,
      shortName: custom.shortName,
    }),
  );

  function resolve(keycode: string): ResolvedKeycode {
    const custom = CUSTOM_PATTERN.exec(keycode);
    if (custom?.[1] !== undefined) {
      const index = Number(custom[1]);
      const resolved = customKeycodes[index];
      return resolved ?? { kind: "outOfRange", name: keycode, index };
    }

    const momentary = MOMENTARY_PATTERN.exec(keycode);
    if (momentary?.[1] !== undefined) {
      const layer = Number(momentary[1]);
      return layer < capacities.layerCount
        ? { kind: "layerMomentary", layer }
        : { kind: "outOfRange", name: keycode, index: layer };
    }

    const layerTap = LAYER_TAP_PATTERN.exec(keycode);
    if (layerTap?.[1] !== undefined && layerTap[2] !== undefined) {
      const layer = Number(layerTap[1]);
      return layer < capacities.layerCount
        ? { kind: "layerTap", layer, inner: layerTap[2] }
        : { kind: "outOfRange", name: keycode, index: layer };
    }

    const tapDance = TAP_DANCE_PATTERN.exec(keycode);
    if (tapDance?.[1] !== undefined) {
      const index = Number(tapDance[1]);
      return index < capacities.tapDanceCount
        ? { kind: "tapDance", index }
        : { kind: "outOfRange", name: keycode, index };
    }

    const macro = MACRO_PATTERN.exec(keycode);
    if (macro?.[1] !== undefined) {
      const index = Number(macro[1]);
      return index < capacities.macroCount
        ? { kind: "macro", index }
        : { kind: "outOfRange", name: keycode, index };
    }

    if (keycode === "KC_NO") return { kind: "none" };
    if (keycode === "KC_TRNS" || keycode === "KC_TRANSPARENT") return { kind: "transparent" };

    return { kind: "basic", name: keycode };
  }

  return { capacities, resolve, customKeycodes };
}
