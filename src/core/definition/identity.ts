/**
 * definition の content-addressing に使う canonical 表現。
 *
 * definition は「workspace の Git 管理ファイル」と「実機が xz で配る payload」の
 * 2 経路から来る（ADR 0002）。同じ内容でも整形が違えば byte は一致しないため、
 * byte をそのまま digest すると同じ definition が別 digest になり、Apply が
 * definition mismatch で止まる。digest の対象をここで 1 つに決める。
 */

/** definition の JSON を、整形とキー順に依存しない 1 つの表現へ正規化する。 */
export function canonicalDefinitionText(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`definition を JSON として読めなかった: ${String(cause)}`);
  }
  return JSON.stringify(sortKeys(parsed), null, 2) + "\n";
}

/** object のキーを再帰的に辞書順へ揃える。array の順序は意味を持つため保つ。 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}
