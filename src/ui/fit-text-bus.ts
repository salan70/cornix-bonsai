/**
 * FitText再計測の合図を配る最小限のpub/sub。
 *
 * 盤面のscale（useBoardScale）やwindow resizeのように、`FitText`自身の
 * props（text・box size）が変わらなくても外側のboxが変わりうる契機をここへ集約する。
 * 個々のFitTextへscaleやResizeObserverを配線せずに済ませるための共有チャンネル。
 */
const listeners = new Set<() => void>();

/** @doc docs/specs/design-system.md#fittext-サイズ固定-文字を縮小 */
export function subscribeFit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @doc docs/specs/design-system.md#fittext-サイズ固定-文字を縮小 */
export function notifyFit(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  let frame: number | undefined;
  window.addEventListener("resize", () => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      notifyFit();
    });
  });
}

/**
 * container queryだけでsizeが決まる要素（keycode pickerのcell等）はReactの
 * propsが変わらずFitTextの再measureが起きない。containerを直接observeして補う。
 *
 * @doc docs/specs/design-system.md#fittext-サイズ固定-文字を縮小
 */
export function observeFitContainer(element: Element): () => void {
  const observer = new ResizeObserver(() => notifyFit());
  observer.observe(element);
  return () => observer.disconnect();
}
