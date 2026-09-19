import type { DiagnosticSummary } from "../../core/validation/types.ts";
import { Button } from "./ui/index.ts";

export type StatusBarMode =
  | {
      readonly kind: "cornix";
      readonly savePath: string;
      readonly changedCount: number;
      readonly canApply: boolean;
      readonly onApply: () => void;
    }
  | {
      readonly kind: "mac";
      readonly savePath: string;
      readonly canExport: boolean;
      readonly onExportKarabiner: () => void;
    };

/** @doc docs/specs/ui.md#header-and-status */
export function StatusBar({
  summary,
  status,
  mode,
  onSeverity,
}: {
  readonly summary: DiagnosticSummary;
  readonly status: string;
  readonly mode: StatusBarMode;
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
      <div className="chrome-divider" aria-hidden="true" />
      {mode.kind === "cornix" ? (
        <span className="u-text-sm u-muted">
          実機との差分 <b>{mode.changedCount}</b> 件
        </span>
      ) : (
        <span className="u-text-sm u-muted">適用は cornix mac apply（CLI）</span>
      )}
      <span className="status-message">{status}</span>
      <span className="u-text-sm u-muted">
        保存先 <span className="u-mono">{mode.savePath}</span>
      </span>
      {mode.kind === "cornix" ? (
        <>
          <Button disabled={mode.changedCount === 0}>差分を見る</Button>
          <Button variant="primary" onClick={mode.onApply} disabled={!mode.canApply}>
            実機へ Apply…
          </Button>
        </>
      ) : (
        <Button onClick={mode.onExportKarabiner} disabled={!mode.canExport}>
          Karabiner assetを書き出す
        </Button>
      )}
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
  const className =
    severity === "error" ? "sev--error" : severity === "warning" ? "sev--warning" : "sev--info";
  return (
    <button
      className={`sev ${className} ${count === 0 ? "is-zero" : ""}`}
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
