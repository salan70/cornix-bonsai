import { createKeycodeTable } from "../../core/keycode/table.ts";
import { keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import type { Selection } from "../types.ts";
import {
  EXTRA_ROW,
  ISO_JIS_ROWS,
  PICKER_GROUP_OFFSETS,
  PICKER_TOTAL_UNITS,
  type PickerEntry,
  type PickerRow,
} from "../keycode-catalog.ts";
import { applyPick, canPick, structuredValues, type PickTarget } from "../keycode-compose.ts";
import type { buildKeymapView } from "../../core/model/keymap-view.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";
import { PickTargetButtons } from "./PickTargetButtons.tsx";

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
        <PickTargetButtons
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          value={(target) => targetValue(input?.keycode, target)}
          labels={labels}
          disabled={disabled}
        />
      </div>
      <div
        className="pk-grid"
        style={{ ["--pk-total" as string]: PICKER_TOTAL_UNITS } as React.CSSProperties}
      >
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
      <div className="pk-strip">
        {EXTRA_ROW.map((entry, entryIndex) => (
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
    </section>
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
  const width = field === "main" ? 16 : field === "nav" ? 3 : 4;
  return (
    <div
      className={`pk-group pk-${field}`}
      style={{
        gridColumn: `${PICKER_GROUP_OFFSETS[field] + 1} / span ${width}`,
      }}
    >
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
        className="pk-cell pk-spacer"
        aria-hidden="true"
        style={{ ["--pk-u" as string]: unit } as React.CSSProperties}
      />
    );
  }
  const display = keycodeDisplay(entry.keycode, labels, table, { compact: true });
  return (
    <span className="pk-cell" style={{ ["--pk-u" as string]: unit } as React.CSSProperties}>
      <button
        className={`pk ${selected ? "on" : ""}`}
        title={`${display.primary}${display.role === undefined ? "" : ` / ${display.role}`} (${entry.keycode})`}
        disabled={disabled}
        onClick={() => onPick(entry.keycode)}
      >
        {renderKeycode(display)}
      </button>
    </span>
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
