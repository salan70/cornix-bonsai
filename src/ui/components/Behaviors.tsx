import type { VilDocument } from "../../core/vil/types.ts";
import { keycodeLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import { settingLabel } from "../../workspace/settings.ts";

/** @doc docs/specs/ui.md#behaviors-and-references */
export function Behaviors({
  document,
  labels,
  onTapDance,
  onCombo,
  onSetting,
}: {
  readonly document: VilDocument;
  readonly labels: WorkspaceLabels;
  readonly onTapDance: (index: number, field: number, value: string) => void;
  readonly onCombo: (index: number, field: number, value: string) => void;
  readonly onSetting: (qsid: number, value: string) => void;
}): React.JSX.Element {
  return (
    <section className="panel">
      <h1>Behaviors</h1>
      <h2>Tap Dance</h2>
      {document.tapDance.map((entry, index) => (
        <fieldset key={index}>
          <legend>#{index}</legend>
          {entry.map((value, field) => (
            <label key={field}>
              {field === 0
                ? "tap"
                : field === 1
                  ? "hold"
                  : field === 2
                    ? "double tap"
                    : field === 3
                      ? "hold after tap"
                      : "timeout"}
              <input
                value={String(value)}
                onChange={(event) => onTapDance(index, field, event.target.value)}
              />
              {typeof value === "string" && keycodeLabel(labels, value) !== undefined ? (
                <span className="muted">表示名: {keycodeLabel(labels, value)}</span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ))}
      <h2>Combo</h2>
      {document.combo.map((entry, index) => (
        <fieldset key={index}>
          <legend>#{index}</legend>
          {entry.map((value, field) => (
            <label key={field}>
              key {field + 1}
              <input
                value={value}
                onChange={(event) => onCombo(index, field, event.target.value)}
              />
              {keycodeLabel(labels, value) === undefined ? null : (
                <span className="muted">表示名: {keycodeLabel(labels, value)}</span>
              )}
            </label>
          ))}
        </fieldset>
      ))}
      <h2>Settings</h2>
      {Object.entries(document.settings).map(([qsid, value]) => (
        <label key={qsid}>
          {settingLabel(Number(qsid))} <span className="muted">(qsid {qsid})</span>
          <input
            type="number"
            value={value}
            onChange={(event) => onSetting(Number(qsid), event.target.value)}
          />
        </label>
      ))}
    </section>
  );
}
