export function Section({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const classes = ["c-section", className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
