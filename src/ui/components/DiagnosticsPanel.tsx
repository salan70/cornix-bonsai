import { useEffect, useMemo } from "react";
import type { Diagnostic, DiagnosticSubject, Severity } from "../../core/validation/types.ts";
import type { Selection } from "../types.ts";
import { Button, Callout, CalloutLabel, Panel, Section, type CalloutTone } from "./ui/index.ts";

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
    <Panel wide>
      <Section>
        <div className="c-panel-heading">
          <h3>診断</h3>
          <Button onClick={onClose}>編集 panelへ</Button>
        </div>
        <span className="u-text-sm u-muted">
          {filter === undefined ? "すべて" : severityLabel(filter)}・{filtered.length} 件
        </span>
        <div className="u-text-sm u-muted">
          severity は診断の性質だけで決まる。Apply を止めるかどうかは Apply 側の gate が判断する。
        </div>
      </Section>
      <Section className="diagnostic-list">
        {groups.length === 0 ? (
          <div className="u-text-sm u-muted">該当する診断はありません。</div>
        ) : (
          groups.map((group) => (
            <div key={group.code}>
              <Callout
                as="button"
                tone={severityTone(group.items[0]?.severity)}
                onClick={() =>
                  group.items[0] === undefined ? undefined : onSelect(group.items[0].subject)
                }
              >
                <span aria-hidden="true">{severityIcon(group.items[0]?.severity)}</span>
                <span className="diag-body">
                  <span className="diag-top">
                    <CalloutLabel>{severityLabel(group.items[0]?.severity)}</CalloutLabel>
                    <span className="u-mono">{group.code}</span>
                  </span>
                  <span className="diag-message">{group.items[0]?.message}</span>
                  <span className="diag-where">{subjectLabel(group.items[0]?.subject)}</span>
                </span>
              </Callout>
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
      </Section>
    </Panel>
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

function severityTone(severity: Severity | undefined): CalloutTone {
  return severity === "error" ? "error" : severity === "warning" ? "warning" : "info";
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
    case "macKey":
      return `Mac layer ${subject.layer} / ${subject.keyCode}`;
  }
}

export function diagnosticSelection(subject: DiagnosticSubject): {
  readonly layer?: number;
  /** Macのlayer番号空間はVialと別なので、飛び先も別のfieldで返す（ADR 0025）。 */
  readonly macLayer?: number;
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
    case "macKey":
      return {
        macLayer: subject.layer,
        selection: { kind: "macKey", keyCode: subject.keyCode },
      };
    default:
      return {};
  }
}
