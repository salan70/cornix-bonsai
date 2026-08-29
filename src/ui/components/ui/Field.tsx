export function Field({
  label,
  as: Tag = "div",
  children,
}: {
  readonly label: string;
  readonly as?: "div" | "label";
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tag className="c-field">
      <span className="c-field-label">{label}</span>
      {children}
    </Tag>
  );
}
