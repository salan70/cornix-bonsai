export type BuildInfo = {
  readonly commitSha: string;
  readonly builtAt: string | undefined;
};

const FALLBACK_BUILD_INFO: BuildInfo = { commitSha: "dev", builtAt: undefined };

export function parseBuildInfo(value: unknown): BuildInfo {
  if (typeof value !== "object" || value === null) return FALLBACK_BUILD_INFO;

  const record = value as Record<string, unknown>;
  const commitSha =
    typeof record.commitSha === "string" && record.commitSha.length > 0
      ? record.commitSha
      : FALLBACK_BUILD_INFO.commitSha;
  const builtAt =
    typeof record.builtAt === "string" && !Number.isNaN(Date.parse(record.builtAt))
      ? record.builtAt
      : FALLBACK_BUILD_INFO.builtAt;

  return { commitSha, builtAt };
}

export function formatBuildTime(builtAt: string | undefined, timeZone?: string): string {
  if (builtAt === undefined) return "時刻不明";

  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return "時刻不明";

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

const rawBuildInfo = typeof import.meta.env === "object" ? import.meta.env.BUILD_INFO : undefined;

export const buildInfo = parseBuildInfo(rawBuildInfo);
