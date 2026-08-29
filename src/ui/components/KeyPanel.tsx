import { useEffect, useState, type RefObject } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import { describeKeycode } from "../../core/diff/describe.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import { buildKeymapView } from "../../core/model/keymap-view.ts";
import { keycodeLabel, layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { Selection } from "../types.ts";
import {
  BEHAVIOR_OPTIONS,
  behaviorKind,
  composeKeycode,
  structuredValues,
  type PickTarget,
} from "../keycode-compose.ts";
import { PickTargetButtons } from "./PickTargetButtons.tsx";
import { Field, Panel, Section } from "./ui/index.ts";

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
  onEditLabel,
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
  readonly onEditLabel: (keycode: string, value: string) => void;
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
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    setLabelDraft(input === undefined ? "" : (keycodeLabel(labels, input.keycode) ?? ""));
  }, [input?.keycode, labels]);

  function commitLabel(): void {
    if (input === undefined) return;
    onEditLabel(input.keycode, labelDraft.trim());
  }

  return (
    <Panel>
      <Section>
        <div className="c-panel-heading">
          <h3>選択中のキー</h3>
          {input === undefined ? null : (
            <span className="u-mono u-muted">
              layer {layer} /{" "}
              {selection?.kind === "encoder"
                ? `encoder ${selection.index}`
                : `row ${selection?.row} / col ${selection?.col}`}
            </span>
          )}
        </div>
        {input === undefined ? null : <div className="u-text-sm u-muted">物理位置を選択中</div>}
      </Section>
      {input === undefined ? null : (
        <>
          <Section>
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
            <Field label="適用先">
              <PickTargetButtons
                className="side-picker-target"
                pickTarget={pickTarget}
                onPickTarget={onPickTarget}
                value={(target) =>
                  target === "whole"
                    ? input.keycode
                    : target === "tap"
                      ? (structured?.tap ?? input.keycode)
                      : (structured?.hold ?? "—")
                }
                labels={labels}
              />
            </Field>
          </Section>
          <Section>
            <h3>詳細</h3>
            <label className="c-field-raw">
              表示名（任意）
              <input
                value={labelDraft}
                placeholder="このkeycodeの名前"
                onChange={(event) => setLabelDraft(event.target.value)}
                onBlur={commitLabel}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
              />
            </label>
            <div className="kv">
              <span>keycode</span>
              <span className="u-mono">{input.keycode}</span>
            </div>
            <div className="kv">
              <span>keymap.yaml</span>
              <span className="u-mono">
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
            <label className="c-field-raw">
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
          </Section>
          <Section>
            <h3>参照</h3>
            {lexeme?.kind === "layerSwitch" ? (
              <div className="row">
                このキーは <b>{layerLabel(labels, lexeme.layer)}</b> を参照している
              </div>
            ) : (
              <div className="u-text-sm u-muted">layer を指す keycode ではありません。</div>
            )}
            <div className="u-text-sm u-muted">
              References で使用箇所と未使用 layer を一覧できます。
            </div>
          </Section>
        </>
      )}
    </Panel>
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
    <Field label={label} as="label">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {[...new Set([value, ...options])].map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}
