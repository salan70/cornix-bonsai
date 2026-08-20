import type { JSX } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import type { buildKeymapView } from "../../core/model/keymap-view.ts";
import { analyzeReachability } from "../../core/validation/reachability.ts";
import type { VilDocument } from "../../core/vil/types.ts";
import { boardMetrics, boardSize, keyBox } from "../../render/geometry.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import { keycodeClass, keycodeDisplay } from "../keycode-display.tsx";

/** mini盤面の幅。高さは幾何から導く。 */
const MINI_BOARD_WIDTH = 218;

/** @doc docs/specs/ui.md#overview-layer-grid */
export function Overview({
  document,
  definition,
  labels,
  view,
}: {
  readonly document: VilDocument;
  readonly definition: Parameters<typeof createKeycodeTable>[0];
  readonly labels: WorkspaceLabels;
  readonly view: ReturnType<typeof buildKeymapView>;
}): JSX.Element {
  const reachability = analyzeReachability(document);
  const table = createKeycodeTable(definition, view.capacities);
  const assignedLayers = new Set([
    ...view.keys
      .filter((key) => key.keycode !== "KC_NO" && key.keycode !== "KC_TRNS")
      .map((key) => key.position.layer),
    ...view.encoders
      .filter((encoder) => encoder.keycode !== "KC_NO" && encoder.keycode !== "KC_TRNS")
      .map((encoder) => encoder.layer),
  ]);
  const assignedCount = assignedLayers.size;
  return (
    <section className="overview-page">
      <div className="overview-toolbar">
        <span className="disc">
          {view.capacities.layerCount} layer 中 {assignedCount} layer に割り当てがある
        </span>
        <div className="grow" />
        <button className="btn" disabled>
          ⇧ SVG で書き出す
        </button>
        <button className="btn" disabled>
          ⇧ PDF で書き出す
        </button>
      </div>
      <div className="overview-grid">
        {Array.from({ length: view.capacities.layerCount }, (_, layer) => (
          <LayerCard
            key={layer}
            layer={layer}
            label={layerLabel(labels, layer)}
            keys={view.keys.filter((key) => key.position.layer === layer)}
            labels={labels}
            table={table}
            assigned={assignedLayers.has(layer)}
            reachable={reachability.reachable.has(layer)}
          />
        ))}
      </div>
      <div className="note overview-note">
        名前が無い layer は <span className="mono">layer N</span> のまま出し、番号を隠さない。
      </div>
    </section>
  );
}

function LayerCard({
  layer,
  label,
  keys,
  labels,
  table,
  assigned,
  reachable,
}: {
  readonly layer: number;
  readonly label: string;
  readonly keys: readonly ReturnType<typeof buildKeymapView>["keys"][number][];
  readonly labels: WorkspaceLabels;
  readonly table: ReturnType<typeof createKeycodeTable>;
  readonly assigned: boolean;
  readonly reachable: boolean;
}): JSX.Element {
  const metrics = boardMetrics(keys.map((key) => key.physical));
  const scale = { unit: metrics.width === 0 ? 0 : MINI_BOARD_WIDTH / metrics.width, gap: 1 };
  const size = boardSize(metrics, scale);
  return (
    <article className={`overview-card ${assigned ? "" : "dim"}`}>
      <div className="overview-heading">
        <b>{label}</b>
        <span className="mono muted">layer {layer}</span>
        <div className="grow" />
        {!assigned ? <span className="tag">未使用</span> : null}
        {assigned && !reachable ? <span className="tag">到達不能</span> : null}
      </div>
      <div
        className="board mini-board"
        style={{ width: `${size.width}px`, height: `${size.height}px` }}
      >
        {keys.map((key) => {
          const box = keyBox(key.physical, metrics, scale);
          return (
            <div
              className={`key ${keycodeClass(key.keycode)}`}
              style={{
                left: `${box.left}px`,
                top: `${box.top}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
                transform: `rotate(${box.angle}deg)`,
                transformOrigin: `${box.originX}px ${box.originY}px`,
              }}
              key={`${key.position.row}:${key.position.col}`}
              title={`${key.position.row}:${key.position.col} ${key.keycode}`}
            >
              <span className="m">
                {assigned && key.keycode !== "KC_NO" && key.keycode !== "KC_TRNS"
                  ? keycodeDisplay(key.keycode, labels, table, { compact: true }).primary
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}
