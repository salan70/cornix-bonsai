import { useLayoutEffect, useRef } from "react";
import type { createKeycodeTable } from "../../core/keycode/table.ts";
import { keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import { observeFitContainer } from "../fit-text-bus.ts";
import {
  EXTRA_ROW,
  ISO_JIS_ROWS,
  PICKER_GROUP_OFFSETS,
  PICKER_TOTAL_UNITS,
  type PickerEntry,
  type PickerRow,
} from "../keycode-catalog.ts";
import { canPick, structuredValues, type PickTarget } from "../keycode-compose.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";
import { PickTargetButtons } from "./PickTargetButtons.tsx";

/**
 * keycode の選択盤。選択中の編集対象が何か（key / encoder / Mac の盤面位置）は知らず、
 * 現在値 `selectedKeycode` と生の pick 通知だけで完結する。合成（`applyPick`）と
 * 保存先の解決は呼び出し側の責務（ADR 0025）。
 *
 * @doc docs/specs/ui.md#keycode-picker
 */
export function KeycodePicker({
  table,
  labels,
  pickTarget,
  onPickTarget,
  selectedKeycode,
  disabled,
  onPick: onPickRaw,
}: {
  readonly table?: ReturnType<typeof createKeycodeTable> | undefined;
  readonly labels: WorkspaceLabels;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  /** 選択中の編集対象の現在値。未割り当て（Mac の素通し）は `undefined` のまま渡す。 */
  readonly selectedKeycode: string | undefined;
  /** 編集対象が選択されていないときに全 cell を無効化する。 */
  readonly disabled: boolean;
  readonly onPick: (picked: string) => void;
}): React.JSX.Element {
  const selectedValue = targetValue(selectedKeycode, pickTarget);
  const containerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    return observeFitContainer(element);
  }, []);

  function onPick(picked: string): void {
    if (disabled || !canPick(pickTarget, picked)) return;
    onPickRaw(picked);
  }

  return (
    <section className="picker" aria-label="keycode picker" ref={containerRef}>
      <div className="picker-heading">
        <h3>Keycode picker</h3>
        <PickTargetButtons
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          value={(target) => targetValue(selectedKeycode, target)}
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
  readonly table?: ReturnType<typeof createKeycodeTable> | undefined;
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
  readonly table?: ReturnType<typeof createKeycodeTable> | undefined;
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
        className={`pk ${selected ? "is-selected" : ""}`}
        title={`${display.primary}${display.role === undefined ? "" : ` / ${display.role}`} (${entry.keycode})`}
        disabled={disabled}
        onClick={() => onPick(entry.keycode)}
      >
        {renderKeycode(display)}
      </button>
    </span>
  );
}

function targetValue(keycode: string | undefined, target: PickTarget): string | undefined {
  if (keycode === undefined) return undefined;
  if (target === "whole") return keycode;
  const values = structuredValues(keycode);
  return target === "tap" ? (values.tap ?? keycode) : values.hold;
}
