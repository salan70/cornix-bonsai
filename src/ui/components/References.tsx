import { collectReferenceUsage } from "../../core/validation/reference-usage.ts";
import { analyzeReachability } from "../../core/validation/reachability.ts";
import type { Diagnostic } from "../../core/validation/types.ts";
import type { VilDocument } from "../../core/vil/types.ts";

/** @doc docs/specs/ui.md#behaviors-and-references */
export function References({
  diagnostics,
  document,
}: {
  readonly diagnostics: readonly Diagnostic[];
  readonly document: VilDocument;
}): React.JSX.Element {
  const usage = collectReferenceUsage(document);
  const reachability = analyzeReachability(document);
  const unusedTapDance = document.tapDance
    .map((_, index) => index)
    .filter((index) => !usage.tapDance.has(index));
  const unusedMacro = document.macro
    .map((_, index) => index)
    .filter((index) => !usage.macro.has(index));
  return (
    <section className="panel">
      <h1>References</h1>
      <h2>Usages</h2>
      <ul>
        {[...usage.tapDance.entries()].map(([index, count]) => (
          <li key={`tapDance-${index}`}>
            TD({index}) — {count} usages
          </li>
        ))}
        {[...usage.macro.entries()].map(([index, count]) => (
          <li key={`macro-${index}`}>
            M({index}) — {count} usages
          </li>
        ))}
        {usage.tapDance.size === 0 && usage.macro.size === 0 ? (
          <li>参照されているdynamic entryはありません。</li>
        ) : null}
      </ul>
      <h2>Unused</h2>
      <p>
        Tap Dance:{" "}
        {unusedTapDance.length === 0
          ? "なし"
          : unusedTapDance.map((index) => `TD(${index})`).join(", ")}
        <br />
        Macro:{" "}
        {unusedMacro.length === 0 ? "なし" : unusedMacro.map((index) => `M(${index})`).join(", ")}
      </p>
      <h2>Unreachable layers</h2>
      <p>
        {reachability.reachable.size === document.layout.length
          ? "なし"
          : document.layout
              .map((_, index) => index)
              .filter((index) => !reachability.reachable.has(index))
              .join(", ")}
      </p>
      <h2>Diagnostics</h2>
      {diagnostics.length === 0 ? (
        <p>診断はありません。</p>
      ) : (
        <ul className="diagnostics">
          {diagnostics.map((diagnostic) => (
            <li key={diagnostic.id}>
              <span className={`severity ${diagnostic.severity}`}>{diagnostic.severity}</span>
              <code>{diagnostic.code}</code>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
