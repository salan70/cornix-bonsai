import { useEffect, useMemo } from "react";
import type { Diagnostic, DiagnosticSubject, Severity } from "../../core/validation/types.ts";
import type { Selection } from "../types.ts";

/** @doc docs/specs/ui.md#diagnostic-panel */
export function DiagnosticsPanel({
  diagnostics,
  filter,
  onClose,
  onSelect,
}: {
  readonly diagnostics: readonly Diagnostic[];
  readonly filter: Severity | undefined;
  readonly onClose: () => void;
  readonly onSelect: (subject: DiagnosticSubject) => void;
}): React.JSX.Element {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filtered =
    filter === undefined
      ? diagnostics
      : diagnostics.filter((diagnostic) => diagnostic.severity === filter);
  const groups = useMemo(() => groupDiagnostics(filtered), [filtered]);

  return (
    <aside className="panel diagnostics-panel">
      <div className="psec">
        <div className="panel-heading">
          <h3>診断</h3>
          <button className="btn" onClick={onClose}>
            編集 panelへ
          </button>
        </div>
        <span className="disc">
          {filter === undefined ? "すべて" : severityLabel(filter)}・{filtered.length} 件
        </span>
        <div className="note">
          severity は診断の性質だけで決まる。Apply を止めるかどうかは Apply 側の gate が判断する。
        </div>
      </div>
      <div className="psec diagnostic-list">
        {groups.length === 0 ? (
          <div className="note">該当する診断はありません。</div>
        ) : (
          groups.map((group) => (
            <div key={group.code}>
              <button
                className={`diag ${severityClass(group.items[0]?.severity)}`}
                onClick={() =>
                  group.items[0] === undefined ? undefined : onSelect(group.items[0].subject)
                }
              >
                <span aria-hidden="true">{severityIcon(group.items[0]?.severity)}</span>
                <span className="body">
                  <span className="top">
                    <span className="lbl">{severityLabel(group.items[0]?.severity)}</span>
                    <span className="mono">{group.code}</span>
                  </span>
                  <span className="msg">{group.items[0]?.message}</span>
                  <span className="where">{subjectLabel(group.items[0]?.subject)}</span>
                </span>
              </button>
              {group.items.length > 1 ? (
                <button
                  className="collapsed diagnostic-collapse"
                  onClick={() =>
                    group.items.slice(1).forEach((diagnostic) => onSelect(diagnostic.subject))
                  }
                >
                  › 同じ診断がほかに {group.items.length - 1} 件（
                  {group.items
                    .slice(1)
                    .map((diagnostic) => subjectLabel(diagnostic.subject))
                    .join("・")}
                  ）
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

interface DiagnosticGroup {
  readonly code: string;
  readonly items: readonly Diagnostic[];
}

function groupDiagnostics(diagnostics: readonly Diagnostic[]): readonly DiagnosticGroup[] {
  const grouped = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const items = grouped.get(diagnostic.code) ?? [];
    items.push(diagnostic);
    grouped.set(diagnostic.code, items);
  }
  return [...grouped.entries()].map(([code, items]) => ({ code, items }));
}

function severityLabel(severity: Severity | undefined): string {
  return severity === "error" ? "エラー" : severity === "warning" ? "警告" : "情報";
}

function severityClass(severity: Severity | undefined): string {
  return severity === "error" ? "e" : severity === "warning" ? "w" : "i";
}

function severityIcon(severity: Severity | undefined): string {
  return severity === "error" ? "⛔" : severity === "warning" ? "⚠" : "ⓘ";
}

function subjectLabel(subject: DiagnosticSubject | undefined): string {
  if (subject === undefined) return "対象なし";
  switch (subject.kind) {
    case "key":
      return `layer ${subject.layer} / row ${subject.row} / col ${subject.col}`;
    case "encoder":
      return `layer ${subject.layer} / encoder ${subject.index} / ${subject.direction === "ccw" ? "左回し" : "右回し"}`;
    case "layer":
      return `layer ${subject.layer}`;
    case "document":
      return "document";
    case "tapDance":
      return `Tap Dance ${subject.index}`;
    case "combo":
      return `Combo ${subject.index}`;
    case "macro":
      return `Macro ${subject.index}`;
    case "setting":
      return `qsid ${subject.qsid}`;
    case "field":
      return subject.name;
  }
}

export function diagnosticSelection(subject: DiagnosticSubject): {
  readonly layer?: number;
  readonly selection?: Selection;
} {
  switch (subject.kind) {
    case "key":
      return {
        layer: subject.layer,
        selection: { kind: "key", row: subject.row, col: subject.col },
      };
    case "encoder":
      return {
        layer: subject.layer,
        selection: { kind: "encoder", index: subject.index, direction: subject.direction },
      };
    case "layer":
      return { layer: subject.layer };
    default:
      return {};
  }
}
