export function Panel({
  as: Tag = "aside",
  wide = false,
  className,
  children,
}: {
  readonly as?: "aside" | "section";
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const classes = ["c-panel", wide ? "c-panel--wide" : "", className].filter(Boolean).join(" ");
  return <Tag className={classes}>{children}</Tag>;
}
