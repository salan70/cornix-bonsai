const TONE_CLASS = {
  neutral: "",
  warning: "c-callout--warning",
  error: "c-callout--error",
  info: "c-callout--info",
} as const;

export type CalloutTone = keyof typeof TONE_CLASS;

export function Callout({
  as: Tag = "div",
  tone = "neutral",
  pushEnd = false,
  className,
  children,
  ...rest
}: {
  readonly as?: "div" | "section" | "button" | "label";
  readonly tone?: CalloutTone;
  readonly pushEnd?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">): React.JSX.Element {
  const classes = ["c-callout", TONE_CLASS[tone], pushEnd ? "u-push-end" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

export function CalloutLabel({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <span className="c-callout-label">{children}</span>;
}
