/**
 * `keymap.yaml`（Git 管理する desired state）の型。
 *
 * ADR 0006 が「状態は `VilDocument` ただ 1 つ」と決めているため、`keymap.yaml` は
 * **第 2 のモデルではなく `VilDocument` の可逆な射影**として定義する（ADR 0009）。
 * `KeymapView` を materialize したものではない。
 *
 */

/**
 * `keymap.yaml` が「どの keyboard definition で解釈されるか」を記録する対応づけ。
 *
 * ADR 0002 の「どの definition で解釈したか記録する」の実体で、置き場所は ADR 0007 が
 * 決めた content-addressed な path。digest は definition の内容の SHA-256。
 */
export interface DefinitionBinding {
  /** 実機の keyboard id。64bit なので文字列（ADR 0001）。 */
  readonly keyboardUid: string;
  /** definition の表示名。差分を読むときの手がかりで、比較の正にはしない。 */
  readonly keyboardName: string;
  /** workspace 内の definition の path（ADR 0007）。 */
  readonly definitionPath: string;
  /** definition の内容の SHA-256（ADR 0007）。 */
  readonly definitionDigest: string;
}

/** `keymap.yaml` の schema 識別子。互換性の無い変更でだけ上げる。 */
export const KEYMAP_YAML_SCHEMA = "cornix-bonsai/keymap@1";

/** `keymap.yaml` が期待した形をしていないときに投げる。 */
export class KeymapYamlParseError extends Error {}
