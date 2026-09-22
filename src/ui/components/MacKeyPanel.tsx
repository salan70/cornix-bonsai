import type { RefObject } from "react";
import { describeKeycode } from "../../core/diff/describe.ts";
import type { MacKeymapDocument } from "../../core/mac-keymap/types.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";
import {
  macBehaviorOptions,
  behaviorKind,
  composeKeycode,
  structuredValues,
  type PickTarget,
} from "../keycode-compose.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import { macKeycapLabel } from "../mac-keycap-labels.ts";
import type { Selection } from "../types.ts";
import { PickTargetButtons } from "./PickTargetButtons.tsx";
import { Field, Panel, SaveStatus, Section, type SaveState } from "./ui/index.ts";

/**
 * Mac 盤面の side panel。KeyPanel と違い matrix 座標も encoder も持たず、位置は
 * Karabiner の `key_code` 名で示す。割り当てを外す（素通しへ戻す）操作はここが持つ。
 *
 * @doc docs/specs/ui.md#mac-tab
 */
export function MacKeyPanel({
  document,
  layer,
  selection,
  labels,
  path,
  editorRef,
  pickTarget,
  onPickTarget,
  onEdit,
  onClear,
  saveState,
  onRetrySave,
}: {
  readonly document: MacKeymapDocument;
  readonly layer: number;
  readonly selection: Selection | undefined;
  readonly labels: WorkspaceLabels;
  readonly path: string;
  readonly editorRef: RefObject<HTMLInputElement | null>;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEdit: (layer: number, keyCode: string, value: string) => void;
  readonly onClear: (layer: number, keyCode: string) => void;
  readonly saveState: SaveState;
  readonly onRetrySave: () => void;
}): React.JSX.Element {
  const keyCode = selection?.kind === "macKey" ? selection.keyCode : undefined;
  const current = keyCode === undefined ? undefined : document.layers.get(layer)?.get(keyCode);
  const lexeme = current === undefined ? undefined : classifyKeycode(current);
  const structured = current === undefined ? undefined : structuredValues(current);

  return (
    <Panel>
      <Section>
        <div className="c-panel-heading">
          <h3>選択中のキー</h3>
          {keyCode === undefined ? null : (
            <span className="u-mono u-muted">
              layer {layer} / {macKeycapLabel(keyCode, document.layout)}
            </span>
          )}
        </div>
        {keyCode === undefined ? null : (
          <div className="u-text-sm u-muted">
            {current === undefined ? "割り当てなし（素通し）" : "割り当てあり"}
          </div>
        )}
        <SaveStatus state={saveState} path={path} onRetry={onRetrySave} />
      </Section>
      {keyCode === undefined ? null : (
        <>
          <Section>
            <Field label="動作">
              <select
                value={current === undefined ? "none" : behaviorKind(lexeme)}
                onChange={(event) =>
                  onEdit(layer, keyCode, composeKeycode(event.target.value, structured))
                }
              >
                {macBehaviorOptions(current === undefined ? "none" : behaviorKind(lexeme)).map(
                  (option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="適用先">
              <PickTargetButtons
                className="side-picker-target"
                pickTarget={pickTarget}
                onPickTarget={onPickTarget}
                value={(target) =>
                  target === "whole"
                    ? (current ?? "—")
                    : target === "tap"
                      ? (structured?.tap ?? current ?? "—")
                      : (structured?.hold ?? "—")
                }
                labels={labels}
              />
            </Field>
          </Section>
          <Section>
            <h3>詳細</h3>
            <div className="kv">
              <span>from（位置）</span>
              <span className="u-mono">{keyCode}</span>
            </div>
            <div className="kv">
              <span>{path}</span>
              <span className="u-mono">
                layers[{layer}] &quot;{keyCode}&quot;
              </span>
            </div>
            <div className="kv">
              <span>挙動</span>
              <span>{current === undefined ? "素通し" : describeKeycode(current)}</span>
            </div>
            <label className="c-field-raw">
              raw keycode
              <input
                ref={editorRef}
                data-keymap-editor
                value={current ?? ""}
                placeholder="空 = 素通し"
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "") onClear(layer, keyCode);
                  else onEdit(layer, keyCode, value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
            {current === undefined ? null : (
              <button className="c-btn" onClick={() => onClear(layer, keyCode)}>
                割り当てを外す（素通しへ戻す）
              </button>
            )}
          </Section>
        </>
      )}
    </Panel>
  );
}
