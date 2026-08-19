/**
 * 診断の型と severity model。
 *
 * severity は**診断そのものの性質**だけで決める。「今 Apply しようとしているか」のような
 * 文脈では変えない。文脈を持つのは `gate.ts` の Apply gate だけで、この分離が
 * 「同じ事実が画面によって別の深刻度で出る」状態を防ぐ（D-003）。
 *
 * severity の判定規則（ADR 0010）:
 *   - `error`       : **座標の意味が変わる**、または `.vil` の構造が壊れている。
 *                     そのまま扱うと全キーを誤って表示・書き込みする
 *   - `warning`     : 意味は確定できるが、**割り当てが 1 件単位で静かに失われる**、
 *                     または実機が意図しない状態になる
 *   - `information` : 情報は保持されている。判断はユーザーに委ねる
 *
 * この module は React・filesystem・WebHID のいずれにも依存しない（AGENTS.md 設計ルール）。
 */

/** 診断の深刻度。 */
export type Severity = "error" | "warning" | "information";

/**
 * 診断が指す対象。
 *
 * `apply/plan.ts` の `WriteTarget` とは別物である。あちらは wire 値（u16）の write 単位で、
 * こちらは raw / semantic 層の位置。層が違うので統合しない（ADR 0003）。
 */
export type DiagnosticSubject =
  | { readonly kind: "document" }
  | { readonly kind: "layer"; readonly layer: number }
  | { readonly kind: "key"; readonly layer: number; readonly row: number; readonly col: number }
  | {
      readonly kind: "encoder";
      readonly layer: number;
      readonly index: number;
      readonly direction: "ccw" | "cw";
    }
  | { readonly kind: "tapDance"; readonly index: number }
  | { readonly kind: "combo"; readonly index: number }
  | { readonly kind: "macro"; readonly index: number }
  | { readonly kind: "setting"; readonly qsid: number }
  | { readonly kind: "field"; readonly name: string };

/** 診断 1 件。`message` は日本語（AGENTS.md）。 */
export interface Diagnostic {
  /** `{責務}/{現象}` 形式の安定した識別子。UI・CLI の分岐はこれで書く。 */
  readonly code: string;
  readonly severity: Severity;
  readonly subject: DiagnosticSubject;
  readonly message: string;
  /** 判定の根拠になった値。`id` の指紋に入る。 */
  readonly details: Readonly<Record<string, string | number>>;
  /**
   * acknowledge の単位になる id。
   *
   * `code` と対象だけでなく**根拠の値も指紋として含める**。含めないと、一度 acknowledge した
   * warning が、対象は同じで中身が変わった後もそのまま通ってしまう（D-003）。
   */
  readonly id: string;
}

/** `DiagnosticSubject` を文字列へ直列化する。 */
export function subjectKey(subject: DiagnosticSubject): string {
  switch (subject.kind) {
    case "document":
      return "document";
    case "layer":
      return `layer:${subject.layer}`;
    case "key":
      return `key:${subject.layer}:${subject.row}:${subject.col}`;
    case "encoder":
      return `encoder:${subject.layer}:${subject.index}:${subject.direction}`;
    case "tapDance":
      return `tapDance:${subject.index}`;
    case "combo":
      return `combo:${subject.index}`;
    case "macro":
      return `macro:${subject.index}`;
    case "setting":
      return `setting:${subject.qsid}`;
    case "field":
      return `field:${subject.name}`;
  }
}

/**
 * 診断を組み立てる。
 *
 * `id` はここでしか作らない。call site ごとに id の作り方が分かれると、acknowledge が
 * 効いたり効かなかったりする経路ができる。
 *
 * @doc docs/specs/validation.md#creatediagnostic
 */
export function createDiagnostic(
  code: string,
  severity: Severity,
  subject: DiagnosticSubject,
  message: string,
  details: Readonly<Record<string, string | number>> = {},
): Diagnostic {
  return {
    code,
    severity,
    subject,
    message,
    details,
    id: `${code}|${subjectKey(subject)}|${fingerprint(details)}`,
  };
}

/** severity ごとの件数。 */
export interface DiagnosticSummary {
  readonly error: number;
  readonly warning: number;
  readonly information: number;
}

/** 診断を severity ごとに数える。 */
export function summarize(diagnostics: readonly Diagnostic[]): DiagnosticSummary {
  let error = 0;
  let warning = 0;
  let information = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error") error++;
    else if (diagnostic.severity === "warning") warning++;
    else information++;
  }
  return { error, warning, information };
}

/** details の内容から短い指紋を作る。暗号用途ではない（衝突しても acknowledge が外れるだけ）。 */
function fingerprint(details: Readonly<Record<string, string | number>>): string {
  const source = Object.keys(details)
    .sort()
    .map((key) => `${key}=${String(details[key])}`)
    .join(";");
  let hash = 5381;
  for (let index = 0; index < source.length; index++) {
    hash = ((hash * 33) ^ source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
