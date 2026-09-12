import { useRef } from "react";
import type { createKeycodeTable } from "../../core/keycode/table.ts";
import { boardMetrics, boardSize, keyBox } from "../../render/geometry.ts";
import type { WorkspaceLabels } from "../../workspace/labels.ts";
import { keycodeClass, keycodeDisplay, renderKeycode } from "../keycode-display.tsx";
import { applyPick, type PickTarget } from "../keycode-compose.ts";
import { moveKey } from "../key-navigation.ts";
import {
  macBoardEntries,
  macLayerNumbers,
  nextMacLayer,
  type MacBoardEntry,
} from "../mac-board.ts";
import { macKeycapLabel } from "../mac-keycap-labels.ts";
import type { MacWorkspaceState } from "../mac-workspace.ts";
import type { Selection } from "../types.ts";
import { KEYMAP_BOARD_SCALE, useBoardScale } from "../use-board-scale.ts";
import { KeycodePicker } from "./KeycodePicker.tsx";
import { Button, Callout, CalloutLabel, Chip } from "./ui/index.ts";

/**
 * Mac 内蔵キーボードのタブ。
 *
 * workspace に `mac-keyboard.yaml` が無くても Vial 編集は成立するため、タブは常設し、
 * missing / error をタブ内の状態表示に閉じ込める。ready では `layout` 宣言に応じた
 * 物理盤面を Cornix と同じ geometry で描画する（ADR 0025）。
 *
 * @doc docs/specs/ui.md#mac-tab
 */
export function MacKeymapTab({
  mac,
  busy,
  onCreate,
  layer,
  setLayer,
  selection,
  setSelection,
  table,
  labels,
  pickTarget,
  onPickTarget,
  onEdit,
  onAddLayer,
  onFocusEditor,
  panel,
}: {
  readonly mac: MacWorkspaceState;
  readonly busy: boolean;
  readonly onCreate: () => void;
  readonly layer: number;
  readonly setLayer: (value: number) => void;
  readonly selection: Selection | undefined;
  readonly setSelection: (value: Selection | undefined) => void;
  readonly table: ReturnType<typeof createKeycodeTable>;
  /** layer 名は Vial の layer 番号空間のものなので、剥がした labels を渡すこと。 */
  readonly labels: WorkspaceLabels;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEdit: (layer: number, keyCode: string, value: string) => void;
  readonly onAddLayer: (layer: number) => void;
  readonly onFocusEditor: () => void;
  readonly panel: React.JSX.Element;
}): React.JSX.Element {
  const entries = mac.kind === "ready" ? macBoardEntries(mac.document, layer) : [];
  const metrics = boardMetrics(entries.map((entry) => entry.physical));
  const { ref: fitRef, scale } = useBoardScale(metrics, KEYMAP_BOARD_SCALE);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);

  if (mac.kind === "missing") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <div className="empty-state">
          <h1>Mac内蔵キーボードの設定が無い</h1>
          <p>
            workspaceにmac-keyboard.yamlを作成すると、MacBook内蔵キーボードの割り当てを
            ここで編集できます。実機への適用はCLI（cornix mac apply）で行います。
          </p>
          <Button variant="primary" disabled={busy} onClick={onCreate}>
            mac-keyboard.yamlを作成
          </Button>
        </div>
      </section>
    );
  }
  if (mac.kind === "error") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <Callout tone="error">
          <CalloutLabel>mac-keyboard.yamlを読み込めない</CalloutLabel>
          <p>{mac.reason}</p>
          <p>ファイルを修正して「再読込」を押してください。</p>
        </Callout>
      </section>
    );
  }

  const { document } = mac;
  const size = boardSize(metrics, scale);
  const selectedKeyCode = selection?.kind === "macKey" ? selection.keyCode : undefined;
  const current =
    selectedKeyCode === undefined
      ? undefined
      : entries.find((entry) => entry.keyCode === selectedKeyCode)?.keycode;

  function selectLayer(nextLayer: number): void {
    setLayer(nextLayer);
    setSelection(undefined);
  }

  function selectKey(entry: MacBoardEntry): void {
    setSelection({ kind: "macKey", keyCode: entry.keyCode });
    window.requestAnimationFrame(() => selectedButtonRef.current?.focus());
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    entry: MacBoardEntry,
  ): void {
    if (event.key === "Enter") {
      event.preventDefault();
      onFocusEditor();
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    const next = moveKey(entries, entry, event.key);
    if (next === undefined) return;
    event.preventDefault();
    selectKey(next);
  }

  return (
    <section className="keymap-layout" aria-label="mac keyboard">
      <div className="editor-pane">
        <div className="layer-chips">
          <span className="u-text-sm u-muted">Layer</span>
          {macLayerNumbers(document).map((index) => (
            <Chip
              as="button"
              selected={layer === index}
              onClick={() => selectLayer(index)}
              key={index}
            >
              layer {index}
            </Chip>
          ))}
          <Chip as="button" onClick={() => onAddLayer(nextMacLayer(document))}>
            + layer追加
          </Chip>
          <span className="u-text-sm u-muted u-push-end">layout: {document.layout}</span>
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
            {entries.map((entry) => {
              const box = keyBox(entry.physical, metrics, scale);
              const selected = selectedKeyCode === entry.keyCode;
              const display =
                entry.keycode === undefined
                  ? undefined
                  : keycodeDisplay(entry.keycode, labels, table, { compact: true });
              return (
                <button
                  ref={selected ? selectedButtonRef : undefined}
                  className={`key ${
                    entry.keycode === undefined ? "is-passthrough" : keycodeClass(entry.keycode)
                  } ${selected ? "is-selected" : ""}`}
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                  }}
                  title={
                    display === undefined
                      ? `${macKeycapLabel(entry.keyCode, document.layout)} (${entry.keyCode}) — 素通し`
                      : `${display.primary} (${entry.keycode})`
                  }
                  onClick={() => selectKey(entry)}
                  onKeyDown={(event) => handleKeyDown(event, entry)}
                  key={entry.keyCode}
                >
                  {display === undefined ? (
                    <span className="keycap-main">
                      {macKeycapLabel(entry.keyCode, document.layout)}
                    </span>
                  ) : (
                    renderKeycode(display)
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <KeycodePicker
          table={table}
          labels={labels}
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          selectedKeycode={current}
          disabled={selectedKeyCode === undefined}
          onPick={(picked) => {
            if (selectedKeyCode === undefined) return;
            onEdit(layer, selectedKeyCode, applyPick(current ?? "KC_NO", pickTarget, picked));
          }}
        />
        <div className="u-text-sm u-muted u-push-end">
          書かれていないキーは素通し。実機への適用はCLI（cornix mac apply）のみ。
        </div>
      </div>
      {panel}
    </section>
  );
}
