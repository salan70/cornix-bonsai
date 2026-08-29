import { FitText } from "./FitText.tsx";

const VARIANT_CLASS = {
  neutral: "",
  primary: "c-btn--primary",
  secondary: "c-btn--secondary",
  ghost: "c-btn--ghost",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASS;

export function Button({
  variant = "neutral",
  className,
  children,
  ...rest
}: {
  readonly variant?: ButtonVariant;
  readonly className?: string;
  readonly children: React.ReactNode;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
>): React.JSX.Element {
  const classes = ["c-btn", VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return (
    <button className={classes} {...rest}>
      <FitText className="c-btn-label">{children}</FitText>
    </button>
  );
}
