import { useLayoutEffect, useRef, useState } from "react";
import { fitUnit, type BoardMetrics, type BoardScale } from "../render/geometry.ts";

/** 盤面ごとの倍率レンジと、その倍率から導くgapの決め方。 */
export interface BoardScalePreset {
  /** 1uのpx下限。 */
  readonly minUnit: number;
  /** 1uのpx上限。 */
  readonly maxUnit: number;
  /** キー間の隙間のpx下限。 */
  readonly minGap: number;
  /** 1uに対するgapの比。 */
  readonly gapRatio: number;
}

/** Keymap editorの盤面。狭い窓でも読め、広い窓でも間延びしない幅に収める。 */
export const KEYMAP_BOARD_SCALE: BoardScalePreset = {
  minUnit: 30,
  maxUnit: 52,
  minGap: 3,
  gapRatio: 0.09,
};

/** Overviewのmini盤面。cardの幅とOverviewが配る高さ予算の両方へ収める。 */
export const OVERVIEW_BOARD_SCALE: BoardScalePreset = {
  minUnit: 14,
  maxUnit: 52,
  minGap: 1,
  gapRatio: 0.07,
};

/**
 * 盤面containerの幅を実測し、盤面全体が収まる1uのpx倍率を返す。
 *
 * `heightBudget`を渡すとその高さにも収める。containerの高さを実測しないのは、
 * container自身が盤面の高さで決まる場合に倍率が自分の出力へ依存してしまうため。
 * 計測はpaint前に行い、初回だけ違う倍率で描かれるのを避ける。
 *
 * @doc docs/specs/ui.md#keymap-editor
 */
export function useBoardScale(
  metrics: BoardMetrics,
  preset: BoardScalePreset,
  heightBudget?: number,
): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly scale: BoardScale;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = (width: number): void => {
      setAvailable((current) => (current === width ? current : width));
    };
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) measure(width);
    });
    observer.observe(element);
    measure(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const unit = fitUnit(
    metrics,
    heightBudget === undefined ? { width: available } : { width: available, height: heightBudget },
    { min: preset.minUnit, max: preset.maxUnit },
  );

  return { ref, scale: { unit, gap: Math.max(preset.minGap, Math.round(unit * preset.gapRatio)) } };
}
