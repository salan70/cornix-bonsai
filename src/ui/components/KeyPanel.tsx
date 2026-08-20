import type { RefObject } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import { describeKeycode } from "../../core/diff/describe.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import { buildKeymapView } from "../../core/model/keymap-view.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { Selection } from "../types.ts";

export function KeyPanel({
  view,
  definition,
  layer,
  selection,
  labels,
  editorRef,
  onEditKey,
  onEditEncoder,
}: {
  readonly view: ReturnType<typeof buildKeymapView>;
  readonly definition: Parameters<typeof createKeycodeTable>[0];
  readonly layer: number;
  readonly selection: Selection | undefined;
  readonly labels: WorkspaceLabels;
  readonly editorRef: RefObject<HTMLInputElement | null>;
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
              options={behaviorOptions}
              onChange={(value) => {
                const next = composeKeycode(value, structured, labels);
                if (selection?.kind === "encoder") onEditEncoder(next);
                else onEditKey(next);
              }}
            />
            <KeySelect
              label="Tap（単押し）"
              value={structured?.tap ?? input.keycode}
              options={keyOptions(structured?.tap ?? input.keycode, view)}
              onChange={(value) => {
                const next = composeKeycode(
                  behaviorKind(lexeme),
                  { ...structured, tap: value },
                  labels,
                );
                if (selection?.kind === "encoder") onEditEncoder(next);
                else onEditKey(next);
              }}
            />
            <KeySelect
              label="Hold（長押し）"
              value={structured?.hold ?? "KC_NO"}
              options={keyOptions(structured?.hold ?? "KC_NO", view)}
              onChange={(value) => {
                const next = composeKeycode(
                  behaviorKind(lexeme),
                  { ...structured, hold: value },
                  labels,
                );
                if (selection?.kind === "encoder") onEditEncoder(next);
                else onEditKey(next);
              }}
            />
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

const behaviorOptions = [
  "basic",
  "modified",
  "modTap",
  "layerSwitch",
  "tapDance",
  "custom",
  "none",
] as const;

function behaviorKind(lexeme: ReturnType<typeof classifyKeycode> | undefined): string {
  if (lexeme === undefined) return "basic";
  switch (lexeme.kind) {
    case "oneShotMod":
      return "modTap";
    case "unknown":
    case "numeric":
      return "custom";
    default:
      return lexeme.kind === "layerSwitch" ? "layerSwitch" : lexeme.kind;
  }
}

interface StructuredValues {
  readonly tap?: string;
  readonly hold?: string;
  readonly layer?: number;
  readonly modifier?: string;
}

function structuredValues(keycode: string): StructuredValues {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "modified":
      return { tap: lexeme.inner, modifier: lexeme.modifier };
    case "modTap":
      return { tap: lexeme.inner, hold: lexeme.modifier, modifier: lexeme.modifier };
    case "layerSwitch":
      return { tap: lexeme.inner ?? "KC_NO", layer: lexeme.layer };
    case "basic":
      return { tap: keycode };
    case "none":
      return { tap: "KC_NO" };
    default:
      return { tap: keycode };
  }
}

function composeKeycode(
  kind: string,
  values: StructuredValues | undefined,
  labels: WorkspaceLabels,
): string {
  const tap = values?.tap ?? "KC_NO";
  const hold = values?.hold ?? "LSFT";
  switch (kind) {
    case "modified":
      return `LGUI(${tap})`;
    case "modTap":
      return `MT(${hold}, ${tap})`;
    case "layerSwitch":
      return `LT${values?.layer ?? 0}(${tap})`;
    case "tapDance":
      return "TD(0)";
    case "custom":
      return tap;
    case "none":
      return "KC_NO";
    case "basic":
      return tap;
    default:
      return labels ? tap : tap;
  }
}

function keyOptions(current: string, view: ReturnType<typeof buildKeymapView>): readonly string[] {
  return [
    "KC_NO",
    "KC_TRNS",
    "KC_A",
    "KC_B",
    "KC_ENTER",
    "KC_SPACE",
    "KC_ESCAPE",
    ...Array.from({ length: view.capacities.layerCount }, (_, index) => `MO(${index})`),
    current,
  ];
}
