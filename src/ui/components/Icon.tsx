import { createContext, useContext } from "react";
import { DEFAULT_ICON_STYLE, type IconStyle } from "../icon-style.ts";
import { ICON_NAMES, sanitizeIconSvg, type IconName } from "../icons.ts";

const flatSources = import.meta.glob<string>("../icons/squircle/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});
const dishSources = import.meta.glob<string>("../icons/dish/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

function markupOf(
  sources: Readonly<Record<string, string>>,
  directory: string,
): Readonly<Record<IconName, string>> {
  return Object.fromEntries(
    ICON_NAMES.map((name) => {
      const source = sources[`../icons/${directory}/${name}.svg`];
      if (source === undefined) throw new Error(`icon が無い: ${directory}/${name}.svg`);
      return [name, sanitizeIconSvg(source)];
    }),
  ) as Record<IconName, string>;
}

/** 読み込み時に 1 度だけ、id と title を外した markup を作る。 */
const MARKUP: Readonly<Record<IconStyle, Readonly<Record<IconName, string>>>> = {
  flat: markupOf(flatSources, "squircle"),
  dish: markupOf(dishSources, "dish"),
};

const SIZE_CLASS = {
  sm: "icon icon-sm",
  md: "icon icon-md",
} as const;

/** 利用者が選んだアイコンの見た目。`App` が値を与える。 */
export const IconStyleContext = createContext<IconStyle>(DEFAULT_ICON_STYLE);

/**
 * 機能アイコン。SVG を inline で描き、色は `currentColor` で隣の語から継ぐ。
 *
 * 読み上げからは外す。意味は隣の語か、操作の `aria-label` が持つ。
 */
export function Icon({
  name,
  size = "sm",
  iconStyle,
}: {
  readonly name: IconName;
  /** `sm` は 16px、`md` は 20px。 */
  readonly size?: keyof typeof SIZE_CLASS;
  /** 設定の見本のように、利用者の選択によらず組を固定するときだけ渡す。 */
  readonly iconStyle?: IconStyle;
}): React.JSX.Element {
  const selected = useContext(IconStyleContext);
  const style = iconStyle ?? selected;
  return (
    <span
      className={SIZE_CLASS[size]}
      data-icon={name}
      data-icon-style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARKUP[style][name] }}
    />
  );
}
