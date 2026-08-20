import type { RefObject } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import { describeKeycode } from "../../core/diff/describe.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import { buildKeymapView } from "../../core/model/keymap-view.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { Selection } from "../types.ts";
import {
  BEHAVIOR_OPTIONS,
  behaviorKind,
  composeKeycode,
  structuredValues,
  type PickTarget,
} from "../keycode-compose.ts";

/** @doc docs/specs/ui.md#side-panel-editing-controls */
export function KeyPanel({
  view,
  definition,
  layer,
  selection,
  labels,
  editorRef,
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
  readonly editorRef: RefObject<HTMLInputElement | null>;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEditKey: (value: string) => void;
  readonly onEditEncoder: (value: string) => void;
}): React.JSX.Element {
  const table = createKeycodeTable(definition, view.capacities);
  const input =
    selection?.kind === "key"
      ? view.keys.find(
          (key) =>
            key.position.layer === layer &&
            key.position.row === selection.row &&
            key.position.col === selection.col,
        )
      : selection?.kind === "encoder"
        ? view.encoders.find(
            (encoder) =>
              encoder.layer === layer &&
              encoder.index === selection.index &&
              encoder.direction === selection.direction,
          )
        : undefined;
  const lexeme = input === undefined ? undefined : classifyKeycode(input.keycode);
  const structured = input === undefined ? undefined : structuredValues(input.keycode);

  return (
    <aside className="panel side-panel">
      <div className="psec">
        <div className="panel-heading">
          <h3>選択中のキー</h3>
          {input === undefined ? null : (
            <span className="mono muted">
              layer {layer} /{" "}
              {selection?.kind === "encoder"
                ? `encoder ${selection.index}`
                : `row ${selection?.row} / col ${selection?.col}`}
            </span>
          )}
        </div>
        <div className="note">
          {input === undefined
            ? "盤面またはencoderから入力を選択してください。"
            : "物理位置を選択中"}
        </div>
      </div>
      {input === undefined ? null : (
        <>
          <div className="psec">
            <KeySelect
              label="動作"
              value={behaviorKind(lexeme)}
              options={BEHAVIOR_OPTIONS}
              onChange={(value) => {
                const next = composeKeycode(value, structured);
                if (selection?.kind === "encoder") onEditEncoder(next);
                else onEditKey(next);
              }}
            />
            <div className="field">
              <span>適用先</span>
              <div className="picker-target side-picker-target" role="group" aria-label="適用先">
                {(
                  [
                    ["whole", "キー全体", input.keycode],
                    ["tap", "Tap", structured?.tap ?? input.keycode],
                    ["hold", "Hold", structured?.hold ?? "—"],
                  ] as const
                ).map(([target, label, value]) => (
                  <button
                    className={pickTarget === target ? "on" : ""}
                    aria-pressed={pickTarget === target}
                    onClick={() => onPickTarget(target)}
                    key={target}
                  >
                    <span>{label}</span>
                    <code>{value}</code>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="psec">
            <h3>詳細</h3>
            <div className="kv">
              <span>keycode</span>
              <span className="mono">{input.keycode}</span>
            </div>
            <div className="kv">
              <span>keymap.yaml</span>
              <span className="mono">
                layers[{layer}]{" "}
                {selection?.kind === "encoder"
                  ? `encoder ${selection.index}`
                  : `row ${selection?.row} col ${selection?.col}`}
              </span>
            </div>
            <div className="kv">
              <span>挙動</span>
              <span>{describeKeycode(input.keycode, table)}</span>
            </div>
            <label className="raw-editor">
              raw keycode
              <input
                ref={editorRef}
                data-keymap-editor
                value={input.keycode}
                onChange={(event) =>
                  selection?.kind === "encoder"
                    ? onEditEncoder(event.target.value)
                    : onEditKey(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>
          <div className="psec">
            <h3>参照</h3>
            {lexeme?.kind === "layerSwitch" ? (
              <div className="row">
                このキーは <b>{layerLabel(labels, lexeme.layer)}</b> を参照している
              </div>
            ) : (
              <div className="note">layer を指す keycode ではありません。</div>
            )}
            <div className="note">References で使用箇所と未使用 layer を一覧できます。</div>
          </div>
        </>
      )}
    </aside>
  );
}

function KeySelect({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {[...new Set([value, ...options])].map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
