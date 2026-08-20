import { createKeycodeTable } from "../../core/keycode/table.ts";
import { keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import type { Selection } from "../types.ts";
import { ISO_JIS_ROWS, type PickerEntry, type PickerRow } from "../keycode-catalog.ts";
import { applyPick, canPick, structuredValues, type PickTarget } from "../keycode-compose.ts";
import type { buildKeymapView } from "../../core/model/keymap-view.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";

/** @doc docs/specs/ui.md#keycode-picker */
export function KeycodePicker({
  view,
  definition,
  layer,
  selection,
  labels,
  pickTarget,
  onPickTarget,
  onEditKey,
  onEditEncoder,
}: {
  readonly view: ReturnType<typeof buildKeymapView>;
  readonly definition: Parameters<typeof createKeycodeTable>[0];
  readonly layer: number;
  readonly selection: Selection | undefined;
  readonly labels: WorkspaceLabels;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEditKey: (value: string) => void;
  readonly onEditEncoder: (value: string) => void;
}): React.JSX.Element {
  const table = createKeycodeTable(definition, view.capacities);
  const input = selectedInput(view, layer, selection);
  const selectedValue = input === undefined ? undefined : targetValue(input.keycode, pickTarget);
  const disabled = input === undefined;

  function onPick(picked: string): void {
    if (input === undefined || !canPick(pickTarget, picked)) return;
    const next = applyPick(input.keycode, pickTarget, picked);
    if (selection?.kind === "encoder") onEditEncoder(next);
    else onEditKey(next);
  }

  return (
    <section className="picker" aria-label="keycode picker">
      <div className="picker-heading">
        <h3>Keycode picker</h3>
        <TargetButtons
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          value={(target) => targetValue(input?.keycode, target)}
          disabled={disabled}
        />
      </div>
      {disabled ? <div className="note">盤面またはencoderから入力を選択してください。</div> : null}
      <div className="pk-grid">
        <PickerGroup
          rows={ISO_JIS_ROWS}
          field="main"
          table={table}
          labels={labels}
          selectedValue={selectedValue}
          disabled={disabled}
          pickTarget={pickTarget}
          onPick={onPick}
        />
        <PickerGroup
          rows={ISO_JIS_ROWS}
          field="nav"
          table={table}
          labels={labels}
          selectedValue={selectedValue}
          disabled={disabled}
          pickTarget={pickTarget}
          onPick={onPick}
        />
        <PickerGroup
          rows={ISO_JIS_ROWS}
          field="numpad"
          table={table}
          labels={labels}
          selectedValue={selectedValue}
          disabled={disabled}
          pickTarget={pickTarget}
          onPick={onPick}
        />
      </div>
    </section>
  );
}

function TargetButtons({
  pickTarget,
  onPickTarget,
  value,
  disabled,
}: {
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly value: (target: PickTarget) => string | undefined;
  readonly disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="picker-target" role="group" aria-label="適用先">
      {(
        [
          ["whole", "キー全体"],
          ["tap", "Tap"],
          ["hold", "Hold"],
        ] as const
      ).map(([target, label]) => (
        <button
          className={pickTarget === target ? "on" : ""}
          aria-pressed={pickTarget === target}
          disabled={disabled}
          onClick={() => onPickTarget(target)}
          key={target}
        >
          <span>{label}</span>
          <code>{value(target) ?? "—"}</code>
        </button>
      ))}
    </div>
  );
}

function PickerGroup({
  rows,
  field,
  table,
  labels,
  selectedValue,
  disabled,
  pickTarget,
  onPick,
}: {
  readonly rows: readonly PickerRow[];
  readonly field: "main" | "nav" | "numpad";
  readonly table: ReturnType<typeof createKeycodeTable>;
  readonly labels: WorkspaceLabels;
  readonly selectedValue: string | undefined;
  readonly disabled: boolean;
  readonly pickTarget: PickTarget;
  readonly onPick: (keycode: string) => void;
}): React.JSX.Element {
  return (
    <div className={`pk-group pk-${field}`}>
      {rows.map((row, rowIndex) => (
        <div className="pk-row" key={rowIndex}>
          {(row[field] ?? []).map((entry, entryIndex) => (
            <PickerEntryButton
              entry={entry}
              table={table}
              labels={labels}
              selected={"keycode" in entry && entry.keycode === selectedValue}
              disabled={disabled || ("keycode" in entry && !canPick(pickTarget, entry.keycode))}
              onPick={onPick}
              key={entryIndex}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function PickerEntryButton({
  entry,
  table,
  labels,
  selected,
  disabled,
  onPick,
}: {
  readonly entry: PickerEntry;
  readonly table: ReturnType<typeof createKeycodeTable>;
  readonly labels: WorkspaceLabels;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPick: (keycode: string) => void;
}): React.JSX.Element {
  const unit = entry.u ?? 1;
  if (!("keycode" in entry)) {
    return (
      <span
        className="pk-spacer"
        aria-hidden="true"
        style={{ ["--pk-u" as string]: unit } as React.CSSProperties}
      />
    );
  }
  const display = keycodeDisplay(entry.keycode, labels, table, { compact: true });
  return (
    <button
      className={`pk ${selected ? "on" : ""}`}
      style={{ ["--pk-u" as string]: unit } as React.CSSProperties}
      title={`${display.primary}${display.role === undefined ? "" : ` / ${display.role}`} (${entry.keycode})`}
      disabled={disabled}
      onClick={() => onPick(entry.keycode)}
    >
      {renderKeycode(display)}
    </button>
  );
}

function selectedInput(
  view: ReturnType<typeof buildKeymapView>,
  layer: number,
  selection: Selection | undefined,
): (typeof view.keys)[number] | (typeof view.encoders)[number] | undefined {
  if (selection?.kind === "key") {
    return view.keys.find(
      (key) =>
        key.position.layer === layer &&
        key.position.row === selection.row &&
        key.position.col === selection.col,
    );
  }
  if (selection?.kind === "encoder") {
    return view.encoders.find(
      (encoder) =>
        encoder.layer === layer &&
        encoder.index === selection.index &&
        encoder.direction === selection.direction,
    );
  }
  return undefined;
}

function targetValue(keycode: string | undefined, target: PickTarget): string | undefined {
  if (keycode === undefined) return undefined;
  if (target === "whole") return keycode;
  const values = structuredValues(keycode);
  return target === "tap" ? (values.tap ?? keycode) : values.hold;
}
