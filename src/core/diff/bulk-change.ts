/**
 * 想定外の大量変更の判定。
 *
 * 大量変更は「そう編集した」よりも「definition を取り違えた」「別のキーボードの keymap を
 * 読み込んだ」「layer が 1 つずれた」の徴候であることが多い。だが**編集の規模そのものは
 * 異常ではない**ので、判定を強くしすぎると正常な作業のたびに Apply が止まる。
 *
 * そこで 2 つの条件を **AND** で課す（ADR 0010）。
 *
 *   - 変更件数が `minChangedEntries` 以上
 *   - 変更の割合が `minChangedRatio` 以上
 *
 * 件数だけだと、10 layer × 50 キーの keymap では 1 layer 差し替えただけで毎回引っかかる。
 * 割合だけだと、combo を 2 件だけ持つ keymap で 1 件変えただけで 50% になる。
 * 両方を満たすときだけ「規模が大きく、かつ全体に対しても大きい」と言える。
 *
 * 表記だけの差（alias）は `KeymapDiff.changedCount` に入らないため、ここでも数えない。
 */

import { createDiagnostic, type Diagnostic } from "../validation/types.ts";
import type { KeymapDiff } from "./diff.ts";

/** 大量変更とみなす閾値。 */
export interface BulkChangeThreshold {
  readonly minChangedEntries: number;
  readonly minChangedRatio: number;
}

/**
 * 既定の閾値。
 *
 * 値そのものに実測の裏付けは無い（ADR 0010 の Open Question）。**閾値を跨いでも
 * Apply は acknowledge で越えられる**ため、外し方の代償は「確認が 1 回増える」で収まる。
 */
export const DEFAULT_BULK_CHANGE_THRESHOLD: BulkChangeThreshold = {
  minChangedEntries: 20,
  minChangedRatio: 0.3,
};

/**
 * 大量変更を診断として返す。
 *
 * どちらも warning にする。**大量変更それ自体は壊れていない**ので error にはできない。
 * 一方で見過ごすと keymap 全体を取り違えたまま実機へ書くため、既定では Apply を止める。
 *
 * @doc docs/specs/semantic-diff.md#detectbulkchange
 */
export function detectBulkChange(
  diff: KeymapDiff,
  threshold: BulkChangeThreshold = DEFAULT_BULK_CHANGE_THRESHOLD,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ratio = diff.comparedCount === 0 ? 0 : diff.changedCount / diff.comparedCount;

  if (diff.changedCount >= threshold.minChangedEntries && ratio >= threshold.minChangedRatio) {
    diagnostics.push(
      createDiagnostic(
        "diff/bulk-change",
        "warning",
        { kind: "document" },
        `${diff.comparedCount} 単位のうち ${diff.changedCount} 件（${Math.round(ratio * 100)}%）が変わる。definition や keymap の取り違えを疑う`,
        {
          changed: diff.changedCount,
          compared: diff.comparedCount,
          percent: Math.round(ratio * 100),
        },
      ),
    );
  }

  // layer 単位の全面置換は、件数が閾値に届かなくても取り違えの強い徴候になる。
  for (const [layer, count] of diff.layers) {
    if (count.assigned === 0 || count.changed < count.assigned) continue;
    diagnostics.push(
      createDiagnostic(
        "diff/layer-replaced",
        "warning",
        { kind: "layer", layer },
        `layer ${layer} の割り当て ${count.assigned} 件が全て変わる`,
        { layer, assigned: count.assigned },
      ),
    );
  }

  return diagnostics;
}
