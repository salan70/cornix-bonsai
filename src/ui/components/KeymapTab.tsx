import { useRef } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import { buildKeymapView } from "../../core/model/keymap-view.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import type { DiagnosticSubject } from "../../core/validation/types.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import type { Selection } from "../types.ts";
import { keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import { moveKey } from "../key-navigation.ts";

export function KeymapTab({
  view,
  definition,
  layer,
  setLayer,
  selection,
  setSelection,
  labels,
  panel,
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
  const boardWidth = Math.max(
    0,
    ...view.keys
      .filter((key) => key.position.layer === layer)
      .map((key) => (key.physical.x + key.physical.width) * 42),
  );
  const boardHeight = Math.max(
    0,
    ...view.keys
      .filter((key) => key.position.layer === layer)
      .map((key) => (key.physical.y + key.physical.height) * 42),
  );

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
        <div className="board" style={{ width: `${boardWidth}px`, height: `${boardHeight}px` }}>
          {view.keys
            .filter((key) => key.position.layer === layer)
            .map((key) => {
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
                  className={`key ${keyClass(key.keycode)} ${selected ? "sel" : ""} ${diagnostic ? "diag-warn" : ""}`}
                  style={{
                    left: `${key.physical.x * 42}px`,
                    top: `${key.physical.y * 42}px`,
                    width: `${key.physical.width * 38}px`,
                    height: `${key.physical.height * 38}px`,
                    transform: `rotate(${key.physical.rotationAngle}deg)`,
                    transformOrigin: `${key.physical.rotationX * 42}px ${key.physical.rotationY * 42}px`,
                  }}
                  onClick={() => selectKey(key)}
                  onKeyDown={(event) => handleKeyDown(event, key)}
                  key={`${key.position.row}:${key.position.col}`}
                >
                  {renderKeycode(keycodeDisplay(key.keycode, labels, table))}
                </button>
              );
            })}
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
                        className={`encslot ${selected ? "sel" : ""} ${diagnostic ? "diag-warn" : ""}`}
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
                          keycodeDisplay(encoder.keycode, labels, table),
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
        <div className="note keyboard-note">
          方向キーで隣のキーへ選択が移り、Enter で右の編集 panel へ focus、Esc で盤面へ戻る。
        </div>
      </div>
      {panel}
    </section>
  );
}

function keyClass(keycode: string): string {
  const lexeme = classifyKeycode(keycode);
  const kind = lexeme.kind;
  switch (kind) {
    case "modified":
      return "mod";
    case "modTap":
    case "oneShotMod":
      return "mod-tap";
    case "layerSwitch":
      return lexeme.inner === undefined ? "layer" : "layer-tap";
    case "tapDance":
      return "tapdance";
    case "custom":
    case "macro":
    case "numeric":
    case "unknown":
      return "custom";
    case "none":
      return "none";
    case "basic":
    case "transparent":
      return "basic";
  }
}
