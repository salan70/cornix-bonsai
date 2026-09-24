import type { Diagnostic, DiagnosticSubject, Severity } from "../core/validation/types.ts";
import type { Selection } from "./types.ts";

/** severity の表示。色だけに頼らず、記号と日本語名を必ず併記する。 */
export const SEVERITY_VIEW: Readonly<
  Record<Severity, { readonly icon: string; readonly label: string }>
> = {
  error: { icon: "⛔", label: "エラー" },
  warning: { icon: "⚠", label: "警告" },
  information: { icon: "ⓘ", label: "情報" },
};

export interface DiagnosticGroup {
  readonly code: string;
  readonly items: readonly Diagnostic[];
}

/**
 * 同じ code の診断を 1 群へまとめる。群の順は最初に現れた順を保つ。
 *
 * @doc docs/specs/ui.md#validation-panel
 */
export function groupDiagnostics(diagnostics: readonly Diagnostic[]): readonly DiagnosticGroup[] {
  const grouped = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const items = grouped.get(diagnostic.code) ?? [];
    items.push(diagnostic);
    grouped.set(diagnostic.code, items);
  }
  return [...grouped.entries()].map(([code, items]) => ({ code, items }));
}

/**
 * 診断の対象を、盤面の layer と選択へ写す。
 *
 * Mac の layer 番号空間は Vial と別なので、飛び先も別の field で返す（ADR 0025）。
 *
 * @doc docs/specs/ui.md#validation-panel
 */
export function diagnosticSelection(subject: DiagnosticSubject): {
  readonly layer?: number;
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

/** 盤面の位置へ移れる対象か。 */
export function canJumpTo(subject: DiagnosticSubject): boolean {
  return (
    subject.kind === "key" ||
    subject.kind === "encoder" ||
    subject.kind === "layer" ||
    subject.kind === "macKey"
  );
}

/** 診断と差分の対象を文言にする。 */
export function subjectLabel(subject: DiagnosticSubject): string {
  switch (subject.kind) {
    case "key":
      return `layer ${subject.layer} / row ${subject.row} col ${subject.col}`;
    case "encoder":
      return `layer ${subject.layer} / encoder ${subject.index} ${subject.direction === "ccw" ? "左回し" : "右回し"}`;
    case "layer":
      return `layer ${subject.layer}`;
    case "document":
      return "文書全体";
    case "tapDance":
      return `Tap Dance ${subject.index}`;
    case "combo":
      return `Combo ${subject.index}`;
    case "macro":
      return `Macro ${subject.index}`;
    case "setting":
      return `settings / qsid ${subject.qsid}`;
    case "field":
      return subject.name;
    case "macKey":
      return `Mac layer ${subject.layer} / ${subject.keyCode}`;
  }
}

/**
 * 盤面へ印を付けるための、診断の対象の鍵。key と encoder と Mac のキーだけを返す。
 * 同じ位置に複数あるときは error を優先する。information は盤面へ出さない。
 */
export function boardDiagnosticMarks(
  diagnostics: readonly Diagnostic[],
): ReadonlyMap<string, "error" | "warning"> {
  const marks = new Map<string, "error" | "warning">();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "information") continue;
    const key = boardSubjectKey(diagnostic.subject);
    if (key === undefined) continue;
    if (marks.get(key) === "error") continue;
    marks.set(key, diagnostic.severity);
  }
  return marks;
}

/** 盤面の 1 か所を指す鍵。診断と差分で同じ書式を使う。 */
export function boardSubjectKey(subject: DiagnosticSubject): string | undefined {
  switch (subject.kind) {
    case "key":
      return `key:${subject.layer}:${subject.row}:${subject.col}`;
    case "encoder":
      return `encoder:${subject.layer}:${subject.index}:${subject.direction}`;
    case "macKey":
      return `macKey:${subject.layer}:${subject.keyCode}`;
    default:
      return undefined;
  }
}
