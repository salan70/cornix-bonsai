import type { ComponentPropsWithoutRef } from "react";

export type ButtonAppearance = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "small" | "medium" | "large";

const APPEARANCE_CLASS: Readonly<Record<ButtonAppearance, string>> = {
  primary: "button--primary",
  secondary: "button--secondary",
  quiet: "button--quiet",
  danger: "button--danger",
};

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  small: "button--small",
  medium: "button--medium",
  large: "button--large",
};

/**
 * 役割（primary / secondary / quiet / danger）と 3 サイズを持つ Button。
 * salan70/uiux-numa d2900ee の experiments/button（採用 variant は pill-action）を写した。
 */
export function Button({
  appearance = "primary",
  size = "medium",
  type = "button",
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "size"> & {
  readonly appearance?: ButtonAppearance;
  readonly size?: ButtonSize;
}): React.JSX.Element {
  const classes = ["button", APPEARANCE_CLASS[appearance], SIZE_CLASS[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...props} type={type} className={classes}>
      {children}
    </button>
  );
}
