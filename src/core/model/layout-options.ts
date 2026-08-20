/**
 * `layout_options` の解釈。
 *
 * **Cornix LP 公式 firmware の no-op 挙動を一般化しない**ための設計がここの主眼（D-001）。
 *
 * ADR 0002 のとおり、公式 firmware V1.10 以降の `layouts.labels` は
 * `[["Firmware Version", "V1.12"]]` で、firmware version の表示に流用されている。
 * つまり「labels がある ⇒ layout 選択肢がある」は成り立たない。
 *
 * そこで 2 つの情報を**独立に**持つ。
 *   - `groups`    : `layouts.labels` 由来。表示用の選択肢の宣言
 *   - `gatesKeys` : 物理配列由来。実際に選択肢で出し分けられるキーが 1 つでもあるか
 *
 * Cornix LP は `groups` があり `gatesKeys` が false という第 3 の状態になる。
 * 「Cornix だから no-op」ではなく「gate するキーがゼロだから no-op」であり、
 * 別の definition では同じコードが gate を検出する。
 *
 */

import type { KeyboardDefinition, PhysicalLayout } from "../definition/types.ts";

/** 選択肢 1 group。 */
export interface LayoutOptionGroup {
  readonly index: number;
  readonly name: string;
  readonly choices: readonly string[];
}

/**
 * `layout_options` の解釈結果。
 *
 * `-1` は「Vial が実機から読まなかった」を意味し、`0` の「読んだ結果が 0」とは別状態。
 */
export type LayoutOptions =
  | { readonly kind: "unread"; readonly raw: number }
  | {
      readonly kind: "decoded";
      readonly raw: number;
      readonly groups: readonly LayoutOptionGroup[];
      readonly gatesKeys: boolean;
    };

/**
 * `layout_options` を解釈する。
 *
 * 解釈結果は**表示のためだけ**に使う。export は常に raw をそのまま書き戻すので、
 * round-trip は解釈の正しさに依存しない（ADR 0001）。
 *
 * @doc docs/specs/semantic-model.md#resolvelayoutoptions
 */
export function resolveLayoutOptions(
  raw: number,
  definition: KeyboardDefinition,
  layout: PhysicalLayout,
): LayoutOptions {
  if (raw < 0) return { kind: "unread", raw };

  const labels = definition.layouts.labels ?? [];
  const groups: LayoutOptionGroup[] = [];
  labels.forEach((label, index) => {
    if (!Array.isArray(label)) return;
    const [name, ...choices] = label as unknown[];
    if (typeof name !== "string") return;
    groups.push({
      index,
      name,
      choices: choices.filter((choice): choice is string => typeof choice === "string"),
    });
  });

  return { kind: "decoded", raw, groups, gatesKeys: hasGatedKeys(layout) };
}

/**
 * definition が layout 選択肢を宣言しているか。
 *
 * vial-gui は**この宣言だけ**を根拠に `layout_options` を実機から read する（R-003）。
 * 実際に gate されるキーがあるか（`hasGatedKeys`）とは独立に判断する。
 */
export function hasLayoutLabels(definition: KeyboardDefinition): boolean {
  const labels = definition.layouts.labels;
  return Array.isArray(labels) && labels.length > 0;
}

/** 物理配列に、layout 選択肢で出し分けられる要素があるか。 */
function hasGatedKeys(layout: PhysicalLayout): boolean {
  return layout.keys.some((key) => key.layoutOption !== undefined);
}
