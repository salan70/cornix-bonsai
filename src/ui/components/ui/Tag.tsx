const VARIANT_CLASS = {
  neutral: "",
  add: "c-tag--add",
  change: "c-tag--change",
  remove: "c-tag--remove",
} as const;

export type TagVariant = keyof typeof VARIANT_CLASS;

export function Tag({
  variant = "neutral",
  children,
}: {
  readonly variant?: TagVariant;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const classes = ["c-tag", VARIANT_CLASS[variant]].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}
