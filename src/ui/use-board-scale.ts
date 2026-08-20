import { useEffect, useRef, useState } from "react";
import type { BoardScale } from "../render/geometry.ts";

/** 1uのpx範囲。狭い窓でも読め、広い窓でも間延びしない幅に収める。 */
const MIN_UNIT = 30;
const MAX_UNIT = 52;

/**
 * 盤面containerの幅を測り、盤面全体が収まる1uのpx倍率を返す。
 *
 * @doc docs/specs/ui.md#keymap-editor
 */
export function useBoardScale(boardWidthInUnits: number): {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly scale: BoardScale;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setAvailable(width);
    });
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const unit =
    boardWidthInUnits <= 0 || available === 0
      ? MAX_UNIT
      : Math.min(MAX_UNIT, Math.max(MIN_UNIT, Math.floor(available / boardWidthInUnits)));

  return { ref, scale: { unit, gap: Math.max(3, Math.round(unit * 0.09)) } };
}
