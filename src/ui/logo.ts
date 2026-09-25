/**
 * ロゴの part の id と、埋め込み後の class の対応。
 * 色は `.logo` の CSS がこの class ごとに塗る。
 *
 * @doc docs/specs/design-system.md#logo
 */
export const LOGO_PART_CLASSES = {
  "part-mark-keys": "logo-ink",
  "part-mark-blue-accent-2": "logo-blue",
  "part-mark-coral-accent-3": "logo-coral",
  "part-mark-pop-accent": "logo-pop",
} as const satisfies Readonly<Record<string, string>>;

/**
 * ロゴの SVG を埋め込み用に整える。
 * `<title>` と `role="img"` を外し、`part-mark-*` の id を `LOGO_PART_CLASSES` の class へ置き換える。
 * header と入口の 2 か所に置いても id が重複しないよう、id は残さない。
 * 対応の無い id があれば、出典の SVG が変わったので例外にする。
 *
 * @doc docs/specs/design-system.md#logo
 */
export function prepareLogoSvg(svg: string): string {
  return svg
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\s+role="img"/g, "")
    .replace(/\sid="([^"]*)"/g, (_, id: string) => {
      const className = (LOGO_PART_CLASSES as Readonly<Record<string, string>>)[id];
      if (className === undefined) throw new Error(`ロゴの part に対応する class が無い: ${id}`);
      return ` class="${className}"`;
    });
}
