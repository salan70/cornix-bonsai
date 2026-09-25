import logoSource from "../icons/logo/keysync.svg?raw";
import { prepareLogoSvg } from "../logo.ts";

const MARKUP = prepareLogoSvg(logoSource);

/**
 * KeySync のロゴ。盤面から 1 個のキーが傾いて浮くマークを inline で描く。
 *
 * 読み上げからは外す。名前は隣の「KeySync」か見出しが持つ。
 */
export function Logo({ size = "md" }: { readonly size?: "md" | "lg" }): React.JSX.Element {
  return (
    <span
      className={size === "lg" ? "logo logo-large" : "logo"}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  );
}
