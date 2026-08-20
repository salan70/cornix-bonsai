import { useRef } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import { buildKeymapView } from "../../core/model/keymap-view.ts";
import type { DiagnosticSubject } from "../../core/validation/types.ts";
import { boardMetrics, boardSize, keyBox } from "../../render/geometry.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { Selection } from "../types.ts";
import { keycodeClass, keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import { KeycodePicker } from "./KeycodePicker.tsx";
import type { PickTarget } from "../keycode-compose.ts";
import { moveKey } from "../key-navigation.ts";
import { useBoardScale } from "../use-board-scale.ts";

/** @doc docs/specs/ui.md#keymap-editor */
export function KeymapTab({
  view,
  definition,
  layer,
  setLayer,
  selection,
  setSelection,
  labels,
  panel,
  pickTarget,
  onPickTarget,
  onEditKey,
  onEditEncoder,
  onFocusEditor,
  diagnosticSubjects = [],
}: {
  readonly view: ReturnType<typeof buildKeymapView>;
  readonly definition: Parameters<typeof createKeycodeTable>[0];
  readonly layer: number;
  readonly setLayer: (value: number) => void;
  readonly selection: Selection | undefined;
  readonly setSelection: (value: Selection | undefined) => void;
  readonly labels: WorkspaceLabels;
  readonly panel: React.JSX.Element;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEditKey: (value: string) => void;
  readonly onEditEncoder: (value: string) => void;
  readonly onFocusEditor: () => void;
  readonly diagnosticSubjects?: readonly DiagnosticSubject[];
}): React.JSX.Element {
  const table = createKeycodeTable(definition, view.capacities);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const layerCount = view.capacities.layerCount;
  const assignedLayers = new Set([
    ...view.keys
      .filter((entry) => entry.keycode !== "KC_NO" && entry.keycode !== "KC_TRNS")
      .map((entry) => entry.position.layer),
    ...view.encoders
      .filter((entry) => entry.keycode !== "KC_NO" && entry.keycode !== "KC_TRNS")
      .map((entry) => entry.layer),
  ]);
  const unusedLayers = Array.from({ length: layerCount }, (_, index) => index).filter(
    (index) => !assignedLayers.has(index),
  );
  const layerKeys = view.keys.filter((key) => key.position.layer === layer);
  const metrics = boardMetrics(layerKeys.map((key) => key.physical));
  const { ref: fitRef, scale } = useBoardScale(metrics.width);
  const size = boardSize(metrics, scale);

  function selectLayer(nextLayer: number): void {
    setLayer(nextLayer);
    setSelection(undefined);
  }

  function selectKey(key: (typeof view.keys)[number]): void {
    setSelection({ kind: "key", row: key.position.row, col: key.position.col });
    window.requestAnimationFrame(() => selectedButtonRef.current?.focus());
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: (typeof view.keys)[number],
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onFocusEditor();
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    const next = moveKey(view, key, event.key);
    if (next === undefined) return;
    event.preventDefault();
    selectKey(next);
  }

  return (
    <section className="keymap-layout">
      <div className="editor-pane">
        <div className="layer-chips">
          <span className="note">Layer</span>
          {Array.from({ length: layerCount }, (_, index) => index)
            .filter((index) => assignedLayers.has(index))
            .map((index) => (
              <button
                className={`chip ${layer === index ? "on" : ""}`}
                onClick={() => selectLayer(index)}
                key={index}
              >
                {layerLabel(labels, index)}
              </button>
            ))}
          {unusedLayers.length > 0 ? (
            <span className="chip faint">
              未使用 {unusedLayers[0]}〜{unusedLayers[unusedLayers.length - 1]}
            </span>
          ) : null}
        </div>
        <div className="board-fit" ref={fitRef}>
          <div
            className="board"
            style={{
              width: `${size.width}px`,
              height: `${size.height}px`,
              ["--cap-font" as string]: `${Math.round(scale.unit * 0.24)}px`,
              ["--cap-sub-font" as string]: `${Math.max(9, Math.round(scale.unit * 0.22))}px`,
            }}
          >
            {layerKeys.map((key) => {
              const box = keyBox(key.physical, metrics, scale);
              const display = keycodeDisplay(key.keycode, labels, table, { compact: true });
              const selected =
                selection?.kind === "key" &&
                selection.row === key.position.row &&
                selection.col === key.position.col;
              const diagnostic = diagnosticSubjects.some(
                (subject) =>
                  subject.kind === "key" &&
                  subject.layer === layer &&
                  subject.row === key.position.row &&
                  subject.col === key.position.col,
              );
              return (
                <button
                  ref={selected ? selectedButtonRef : undefined}
                  className={`key ${keycodeClass(key.keycode)} ${selected ? "sel" : ""} ${diagnostic ? "diag-warn" : ""}`}
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                    transform: `rotate(${box.angle}deg)`,
                    transformOrigin: `${box.originX}px ${box.originY}px`,
                  }}
                  title={capTitle(display, key.keycode)}
                  onClick={() => selectKey(key)}
                  onKeyDown={(event) => handleKeyDown(event, key)}
                  key={`${key.position.row}:${key.position.col}`}
                >
                  {renderKeycode(display)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="encstrip" aria-label="encoders">
          {[
            ...new Set(
              view.encoders
                .filter((encoder) => encoder.layer === layer)
                .map((encoder) => encoder.index),
            ),
          ]
            .sort((left, right) => left - right)
            .map((index) => (
              <div className="enc" key={index}>
                <div className="encdial" aria-hidden="true" />
                <div className="encoder-pair">
                  {(["ccw", "cw"] as const).map((direction) => {
                    const encoder = view.encoders.find(
                      (candidate) =>
                        candidate.layer === layer &&
                        candidate.index === index &&
                        candidate.direction === direction,
                    );
                    if (encoder === undefined) return null;
                    const selected =
                      selection?.kind === "encoder" &&
                      selection.index === index &&
                      selection.direction === direction;
                    const diagnostic = diagnosticSubjects.some(
                      (subject) =>
                        subject.kind === "encoder" &&
                        subject.layer === layer &&
                        subject.index === index &&
                        subject.direction === direction,
                    );
                    return (
                      <button
                        className={`encslot ${keycodeClass(encoder.keycode)} ${selected ? "sel" : ""} ${diagnostic ? "diag-warn" : ""}`}
                        title={capTitle(
                          keycodeDisplay(encoder.keycode, labels, table, { compact: true }),
                          encoder.keycode,
                        )}
                        onClick={() => setSelection({ kind: "encoder", index, direction })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onFocusEditor();
                          }
                        }}
                        key={direction}
                      >
                        {renderKeycode(
                          keycodeDisplay(encoder.keycode, labels, table, { compact: true }),
                          direction === "ccw" ? "↺ " : "↻ ",
                        )}
                      </button>
                    );
                  })}
                </div>
                <span className="note">Encoder {index}</span>
              </div>
            ))}
        </div>
        <KeycodePicker
          view={view}
          definition={definition}
          layer={layer}
          selection={selection}
          labels={labels}
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          onEditKey={onEditKey}
          onEditEncoder={onEditEncoder}
        />
        <div className="note keyboard-note">
          方向キーで隣のキーへ選択が移り、Enter で右の編集 panel へ focus、Esc で盤面へ戻る。
        </div>
      </div>
      {panel}
    </section>
  );
}

function capTitle(
  display: { readonly primary: string; readonly role?: string },
  keycode: string,
): string {
  const head =
    display.role === undefined ? display.primary : `${display.primary} / ${display.role}`;
  return `${head}  (${keycode})`;
}
