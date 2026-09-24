import { useEffect, useRef, type ReactNode } from "react";

export type PanelSize = "window" | "full";

/**
 * 左端の入口から開く作業パネル。native の `<dialog>` を `showModal()` で画面中央に開き、全画面へ広げられる。
 *
 * Esc、×、背景の押下でいつでも閉じられる。途中で閉じられない Apply の modal とはここで区別する。
 * 開いている間は背後が inert になるため、閉じた後の focus の移動は呼び出し側が閉じた描画の後で行う。
 */
export function PanelDialog({
  id,
  tone,
  title,
  subtitle,
  size,
  onSize,
  onClose,
  children,
}: {
  readonly id: string;
  /** 見出しの帯の色。`tone-*` の class 名。 */
  readonly tone: string;
  readonly title: string;
  readonly subtitle: string;
  readonly size: PanelSize;
  readonly onSize: (size: PanelSize) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const full = size === "full";
  return (
    <dialog
      ref={dialogRef}
      className={`sheet ${full ? "is-full" : "is-window"} ${tone}`}
      data-panel-dialog={id}
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // 背景（dialog 自身）を押したら閉じる。中身の余白では閉じない。
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="sheet-head">
        <h2 id="sheet-title" ref={headingRef} tabIndex={-1}>
          {title}
          <small>{subtitle}</small>
        </h2>
        <span className="spacer" />
        <button
          type="button"
          className="sheet-btn"
          aria-pressed={full}
          onClick={() => onSize(full ? "window" : "full")}
        >
          <span aria-hidden="true">{full ? "⤡" : "⤢"}</span>{" "}
          {full ? "元の大きさに戻す" : "全画面で表示"}
        </button>
        <button type="button" className="sheet-btn" data-close onClick={onClose}>
          × 閉じる <kbd>Esc</kbd>
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}
