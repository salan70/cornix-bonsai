import type { DiagnosticSummary } from "../../core/validation/types.ts";

export function StatusBar({
  summary,
  changedCount,
  status,
  canApply,
  onApply,
  onSeverity,
}: {
  readonly summary: DiagnosticSummary;
  readonly changedCount: number;
  readonly status: string;
  readonly canApply: boolean;
  readonly onApply: () => void;
  readonly onSeverity?: (severity: keyof DiagnosticSummary) => void;
}): React.JSX.Element {
  return (
    <footer className="status">
      <SeverityButton severity="error" label="エラー" count={summary.error} onClick={onSeverity} />
      <SeverityButton
        severity="warning"
        label="警告"
        count={summary.warning}
        onClick={onSeverity}
      />
      <SeverityButton
        severity="information"
        label="情報"
        count={summary.information}
        onClick={onSeverity}
      />
      <span className="status-disc">
        | 実機との差分 <b>{changedCount}</b> 件
      </span>
      <span className="status-message">{status}</span>
      <span className="disc">
        保存先 <span className="mono">keymap.yaml</span>
      </span>
      <button className="btn" disabled={changedCount === 0}>
        差分を見る
      </button>
      <button className="btn primary" onClick={onApply} disabled={!canApply}>
        実機へ Apply…
      </button>
    </footer>
  );
}

function SeverityButton({
  severity,
  label,
  count,
  onClick,
}: {
  readonly severity: "error" | "warning" | "information";
  readonly label: string;
  readonly count: number;
  readonly onClick: ((severity: keyof DiagnosticSummary) => void) | undefined;
}): React.JSX.Element {
  const key = severity;
  const className = severity === "error" ? "err" : severity === "warning" ? "warn" : "info";
  return (
    <button
      className={`sev ${className} ${count === 0 ? "zero" : ""}`}
      onClick={() => onClick?.(key)}
      aria-label={`${label} ${count}件`}
    >
      <span aria-hidden="true">
        {severity === "error" ? "⛔" : severity === "warning" ? "⚠" : "ⓘ"}
      </span>
      <span>
        {label} {count}
      </span>
    </button>
  );
}
