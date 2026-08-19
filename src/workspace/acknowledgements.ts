/** Apply warningのacknowledge IDをworkspaceへ保存する。 */

export function parseAcknowledgements(text: string | undefined): readonly string[] {
  if (text === undefined || text.trim() === "") return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("acknowledgements.json はstring arrayでなければならない");
  }
  return [...new Set(parsed)].sort();
}

export function serializeAcknowledgements(ids: readonly string[]): string {
  return `${JSON.stringify([...new Set(ids)].sort(), null, 2)}\n`;
}
