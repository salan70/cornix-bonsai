import { FitText } from "./FitText.tsx";

export function Chip({
  as: Tag = "span",
  selected = false,
  connected = false,
  faint = false,
  dot = false,
  className,
  children,
  ...rest
}: {
  readonly as?: "span" | "button";
  readonly selected?: boolean;
  readonly connected?: boolean;
  readonly faint?: boolean;
  readonly dot?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
} & Omit<
  React.HTMLAttributes<HTMLSpanElement | HTMLButtonElement>,
  "className" | "children"
>): React.JSX.Element {
  const classes = [
    "c-chip",
    selected ? "is-selected" : "",
    connected ? "is-connected" : "",
    faint ? "c-chip--faint" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {dot ? <span className="c-chip-dot" /> : null}
      <span className="c-chip-label-box">
        <FitText className="c-chip-label">{children}</FitText>
      </span>
    </>
  );
  return Tag === "button" ? (
    <button className={classes} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  ) : (
    <span className={classes} {...(rest as React.HTMLAttributes<HTMLSpanElement>)}>
      {content}
    </span>
  );
}
