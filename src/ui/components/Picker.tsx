import { useLayoutEffect, useRef } from "react";
import type { createKeycodeTable } from "../../core/keycode/table.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";
import { observeFitContainer } from "../fit-text-bus.ts";
import {
  EXTRA_ROW,
  ISO_JIS_ROWS,
  PICKER_GROUP_OFFSETS,
  PICKER_TOTAL_UNITS,
  type PickerEntry,
} from "../keycode-catalog.ts";
import { canPick, structuredValues, type PickTarget } from "../keycode-compose.ts";
import { keycapTitle, keycodeDisplay, kindClass } from "../keycode-display.tsx";
import { FitText } from "./FitText.tsx";

/**
 * keycode の選択盤。Vial の ISO/JIS 面に合わせた 26u の物理配列と、下部の記号の帯。
 *
 * 選択中の編集対象が何か（key / encoder / Mac の盤面位置）は知らず、現在値 `selectedKeycode` と、
 * 選ばれた keycode を生のまま通知するだけにする。適用先での組み立て（`applyPick`）と保存先の解決は呼び出し側が持つ（ADR 0025）。
 */
export function Picker({
  table,
  labels,
  pickTarget,
  selectedKeycode,
  disabled,
  isKeycodeEnabled,
  disabledReason,
  onPick,
}: {
  readonly table: ReturnType<typeof createKeycodeTable> | undefined;
  readonly labels: WorkspaceLabels;
  readonly pickTarget: PickTarget;
  /** 選択中の編集対象の現在値。未割り当て（Mac の素通し）は `undefined` のまま渡す。 */
  readonly selectedKeycode: string | undefined;
  /** 編集対象が選ばれていないときに全 cell を無効にする。 */
  readonly disabled: boolean;
  /** 省略時は語彙を絞らない。Mac は `macKeycodeSupport` を渡す。 */
  readonly isKeycodeEnabled?: (keycode: string) => boolean;
  /** `isKeycodeEnabled` で無効にした cell の理由。 */
  readonly disabledReason?: string;
  readonly onPick: (keycode: string) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const current = targetValue(selectedKeycode, pickTarget);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    return observeFitContainer(element);
  }, []);

  function cell(entry: PickerEntry, left: number, key: string): React.JSX.Element | null {
    if (!("keycode" in entry)) return null;
    const unit = entry.u ?? 1;
    const keycode = entry.keycode;
    const holdBlocked = !canPick(pickTarget, keycode);
    const vocabularyBlocked = isKeycodeEnabled !== undefined && !isKeycodeEnabled(keycode);
    const reason = vocabularyBlocked
      ? (disabledReason ?? "この対象では選べない")
      : holdBlocked
        ? "Hold に選べるのは modifier だけ"
        : undefined;
    const display = keycodeDisplay(keycode, labels, table, { compact: true });
    const modifier = canPick("hold", keycode);
    const label = display.primary.replace(/\n/g, " ");
    return (
      <button
        key={key}
        type="button"
        data-keycode={keycode}
        className={`pk ${modifier ? "kind-mod" : kindClass(keycode)}${current === keycode ? " is-current" : ""}`}
        style={{
          left: `${(left / PICKER_TOTAL_UNITS) * 100}%`,
          width: `calc(${(unit / PICKER_TOTAL_UNITS) * 100}% - var(--space-50))`,
        }}
        disabled={disabled || reason !== undefined}
        aria-pressed={current === keycode}
        aria-label={`${label}（${keycode}）${reason === undefined ? "" : `、${reason}`}`}
        title={`${keycapTitle(display, keycode)}${reason === undefined ? "" : `、${reason}`}`}
        onClick={() => onPick(keycode)}
      >
        <FitText className="keycap-main">{display.primary}</FitText>
      </button>
    );
  }

  function group(entries: readonly PickerEntry[] | undefined, offset: number, prefix: string) {
    let left = offset;
    return (entries ?? []).map((entry, index) => {
      const node = cell(entry, left, `${prefix}-${index}`);
      left += entry.u ?? 1;
      return node;
    });
  }

  return (
    <div className="picker" ref={containerRef} aria-disabled={disabled}>
      {ISO_JIS_ROWS.map((row, index) => (
        <div className="pk-row" key={index}>
          {group(row.main, PICKER_GROUP_OFFSETS.main, `m${index}`)}
          {group(row.nav, PICKER_GROUP_OFFSETS.nav, `n${index}`)}
          {group(row.numpad, PICKER_GROUP_OFFSETS.numpad, `p${index}`)}
        </div>
      ))}
      <div className="pk-row pk-row-extra">{group(EXTRA_ROW, 0, "x")}</div>
    </div>
  );
}

/** 適用先に応じた現在値。Tap は内側の keycode、Hold は modifier の keycode。 */
export function targetValue(keycode: string | undefined, target: PickTarget): string | undefined {
  if (keycode === undefined) return undefined;
  if (target === "whole") return keycode;
  const values = structuredValues(keycode);
  return target === "tap" ? (values.tap ?? keycode) : values.hold;
}
