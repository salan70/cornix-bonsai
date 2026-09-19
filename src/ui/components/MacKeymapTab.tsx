import { useRef } from "react";
import { macKeycodeSupport } from "../../core/mac-keymap/generate.ts";
import type { MacKeyboardLayout } from "../../core/mac-keymap/types.ts";
import type { DiagnosticSubject } from "../../core/validation/types.ts";
import { boardMetrics, boardSize, keyBox } from "../../render/geometry.ts";
import { macKeymapPath } from "../../workspace/layout.ts";
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
 * 選んだ物理配列の Mac キーボード編集。
 *
 * ファイルが無くても Cornix 編集は成立するため、対象は常設し、missing / error を
 * タブ内の状態表示に閉じ込める。ready ではその配列の物理盤面を Cornix と同じ
 * geometry で描画する（ADR 0025 / 0027）。
 *
 * @doc docs/specs/ui.md#mac-tab
 */
export function MacKeymapTab({
  layout,
  mac,
  busy,
  onCreate,
  layer,
  setLayer,
  selection,
  setSelection,
  labels,
  pickTarget,
  onPickTarget,
  onEdit,
  onAddLayer,
  onFocusEditor,
  onExportKarabiner,
  diagnosticSubjects = [],
  panel,
}: {
  readonly layout: MacKeyboardLayout;
  readonly mac: MacWorkspaceState;
  readonly busy: boolean;
  readonly onCreate: () => void;
  readonly layer: number;
  readonly setLayer: (value: number) => void;
  readonly selection: Selection | undefined;
  readonly setSelection: (value: Selection | undefined) => void;
  /** layer 名は Vial の layer 番号空間のものなので、剥がした labels を渡すこと。 */
  readonly labels: WorkspaceLabels;
  readonly pickTarget: PickTarget;
  readonly onPickTarget: (target: PickTarget) => void;
  readonly onEdit: (layer: number, keyCode: string, value: string) => void;
  readonly onAddLayer: (layer: number) => void;
  readonly onFocusEditor: () => void;
  readonly onExportKarabiner: () => void;
  readonly diagnosticSubjects?: readonly DiagnosticSubject[];
  readonly panel: React.JSX.Element;
}): React.JSX.Element {
  const entries = mac.kind === "ready" ? macBoardEntries(mac.document, layer) : [];
  const metrics = boardMetrics(entries.map((entry) => entry.physical));
  const { ref: fitRef, scale } = useBoardScale(metrics, KEYMAP_BOARD_SCALE);
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const path = macKeymapPath(layout);

  if (mac.kind === "missing") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <div className="empty-state">
          <h1>Macキーボード（{layout.toUpperCase()}）の設定が無い</h1>
          <p>
            workspaceに{path}を作成すると、この物理配列の割り当てをここで編集できます。
            実機への適用はCLI（cornix mac apply）で行います。
          </p>
          <Button variant="primary" disabled={busy} onClick={onCreate}>
            {path}を作成
          </Button>
        </div>
      </section>
    );
  }
  if (mac.kind === "error") {
    return (
      <section className="mac-tab" aria-label="mac keyboard">
        <Callout tone="error">
          <CalloutLabel>{path}を読み込めない</CalloutLabel>
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
          <span className="mac-scope u-push-end">
            {document.devices.map((device, index) => (
              <Chip
                key={index}
                title={
                  "builtIn" in device
                    ? "{ is_built_in_keyboard: true }"
                    : `{ vendor_id: ${device.vendorId}, product_id: ${device.productId} }`
                }
              >
                {"builtIn" in device ? "内蔵" : `${device.vendorId}:${device.productId}`}
              </Chip>
            ))}
            <span className="u-text-sm u-muted" title="外付けの追加は CLI だけが観測一覧を読める">
              追加は cornix mac devices
            </span>
          </span>
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
              const diagnostic = diagnosticSubjects.some(
                (subject) =>
                  subject.kind === "macKey" &&
                  subject.layer === layer &&
                  subject.keyCode === entry.keyCode,
              );
              const display =
                entry.keycode === undefined
                  ? undefined
                  : keycodeDisplay(entry.keycode, labels, undefined, { compact: true });
              return (
                <button
                  ref={selected ? selectedButtonRef : undefined}
                  className={`key ${
                    entry.keycode === undefined ? "is-passthrough" : keycodeClass(entry.keycode)
                  } ${selected ? "is-selected" : ""} ${diagnostic ? "is-diag-warn" : ""}`}
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
          labels={labels}
          pickTarget={pickTarget}
          onPickTarget={onPickTarget}
          selectedKeycode={current}
          disabled={selectedKeyCode === undefined}
          isKeycodeEnabled={(keycode) => macKeycodeSupport(keycode).ok}
          onPick={(picked) => {
            if (selectedKeyCode === undefined) return;
            onEdit(layer, selectedKeyCode, applyPick(current ?? "KC_NO", pickTarget, picked));
          }}
        />
        <div className="mac-export-row u-push-end">
          <span className="u-text-sm u-muted">
            書かれていないキーは素通し。実機への適用はCLI（cornix mac apply）のみ。
          </span>
          <Button onClick={onExportKarabiner}>Karabiner assetを書き出す</Button>
        </div>
      </div>
      {panel}
    </section>
  );
}
