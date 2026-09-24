import { useEffect, useLayoutEffect, useRef } from "react";
import { subscribeFit } from "../fit-text-bus.ts";

const MIN_SCALE = 0.55;
const STEP = 0.06;

function useFit(): React.RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);

  const fit = (): void => {
    const el = ref.current;
    const box = el?.parentElement;
    if (el === null || el === undefined || box === null || box === undefined) return;
    const style = window.getComputedStyle(box);
    const availableWidth =
      box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight =
      box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    let scale = 1;
    el.style.setProperty("--fit-scale", "1");
    while (
      scale > MIN_SCALE &&
      (el.scrollWidth > availableWidth || el.scrollHeight > availableHeight)
    ) {
      scale = Math.max(MIN_SCALE, scale - STEP);
      el.style.setProperty("--fit-scale", String(scale));
    }
  };

  useLayoutEffect(fit);
  useEffect(() => subscribeFit(fit), []);

  return ref;
}

/**
 * 親要素（固定sizeのkeycap・cell・button）の枠を変えず、収まるまでfont-sizeを
 * 段階的に縮める。基準sizeは呼び出し側のCSS（`--cap-font`等）が決め、
 * FitTextは`--fit-scale`という掛け算係数だけを持つ。
 */
export function FitText({
  as = "span",
  className,
  children,
}: {
  readonly as?: "span" | "small";
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const ref = useFit();
  return as === "small" ? (
    <small ref={ref as React.RefObject<HTMLElement>} className={className}>
      {children}
    </small>
  ) : (
    <span ref={ref as React.RefObject<HTMLElement>} className={className}>
      {children}
    </span>
  );
}
