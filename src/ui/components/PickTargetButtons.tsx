import { keycodeLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { PickTarget } from "../keycode-compose.ts";

const TARGETS = [
  ["whole", "キー全体"],
  ["tap", "Tap"],
  ["hold", "Hold"],
] as const satisfies readonly (readonly [PickTarget, string])[];

export function PickTargetButtons({
  className,
  pickTarget,
  onPickTarget,
  value,
  labels,
  disabled = false,
}: {
  readonly className?: string;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly value: (target: PickTarget) => string | undefined;
  readonly labels: WorkspaceLabels;
  readonly disabled?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`picker-target${className === undefined ? "" : ` ${className}`}`}
      role="group"
      aria-label="適用先"
    >
      {TARGETS.map(([target, label]) => {
        const formatted = formatTargetValue(value(target), labels);
        return (
          <button
            className={pickTarget === target ? "on" : ""}
            aria-pressed={pickTarget === target}
            disabled={disabled}
            title={formatted}
            onClick={() => onPickTarget(target)}
            key={target}
          >
            <span>{label}</span>
            <code>{formatted}</code>
          </button>
        );
      })}
    </div>
  );
}

function formatTargetValue(value: string | undefined, labels: WorkspaceLabels): string {
  if (value === undefined) return "—";
  const name = keycodeLabel(labels, value);
  return name === undefined ? value : `${name} (${value})`;
}
