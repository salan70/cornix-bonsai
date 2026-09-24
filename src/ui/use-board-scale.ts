import { useLayoutEffect, useRef, useState } from "react";
import { fitUnit, type BoardMetrics, type BoardScale } from "../render/geometry.ts";
import { notifyFit } from "./fit-text-bus.ts";

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

  useLayoutEffect(() => {
    notifyFit();
  }, [unit]);

  return { ref, scale: { unit, gap: Math.max(preset.minGap, Math.round(unit * preset.gapRatio)) } };
}

/**
 * 盤面の台（stage）の幅と高さを実測し、盤面全体が収まる1uのpx倍率を返す。
 *
 * `ref`は大きさが外から決まる要素（grid の行と列で決まる台）へ付ける。盤面自身の大きさで高さが決まる要素を
 * 測ると、倍率が自分の出力へ依存するためである。`reserveRef`の要素（encoder の帯）の高さと、台の padding と
 * 行間は盤面に使えない高さとして引く。帯の高さは倍率に依らない。
 *
 * @doc docs/specs/ui.md#keymap-editor
 */
export function useStageScale(
  metrics: BoardMetrics,
  preset: BoardScalePreset,
  reserveRef?: React.RefObject<HTMLElement | null>,
): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly scale: BoardScale;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = (): void => {
      const style = window.getComputedStyle(element);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const reserve = reserveRef?.current;
      const reserved =
        reserve === null || reserve === undefined
          ? 0
          : reserve.offsetHeight + (parseFloat(style.rowGap) || 0);
      const next = {
        width: Math.max(0, element.clientWidth - padX),
        height: Math.max(0, element.clientHeight - padY - reserved),
      };
      setAvailable((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (reserveRef?.current) observer.observe(reserveRef.current);
    measure();
    return () => observer.disconnect();
  }, [reserveRef]);

  const unit = fitUnit(metrics, available, { min: preset.minUnit, max: preset.maxUnit });

  useLayoutEffect(() => {
    notifyFit();
  }, [unit]);

  return { ref, scale: { unit, gap: Math.max(preset.minGap, Math.round(unit * preset.gapRatio)) } };
}
