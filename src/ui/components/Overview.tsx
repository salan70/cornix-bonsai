import type { JSX } from "react";
import type { buildKeymapView } from "../../core/model/keymap-view.ts";
import { analyzeReachability } from "../../core/validation/reachability.ts";
import { classifyKeycode } from "../../core/validation/keycode-vocabulary.ts";
import type { VilDocument } from "../../core/vil/types.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import { basicLabel } from "../keycode-display.tsx";

/** @doc docs/specs/ui.md#overview-layer-grid */
export function Overview({
  document,
  labels,
  view,
}: {
  readonly document: VilDocument;
  readonly labels: WorkspaceLabels;
  readonly view: ReturnType<typeof buildKeymapView>;
}): JSX.Element {
  const reachability = analyzeReachability(document);
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
  assigned,
  reachable,
}: {
  readonly layer: number;
  readonly label: string;
  readonly keys: readonly ReturnType<typeof buildKeymapView>["keys"][number][];
  readonly assigned: boolean;
  readonly reachable: boolean;
}): JSX.Element {
  return (
    <article className={`overview-card ${assigned ? "" : "dim"}`}>
      <div className="overview-heading">
        <b>{label}</b>
        <span className="mono muted">layer {layer}</span>
        <div className="grow" />
        {!assigned ? <span className="tag">未使用</span> : null}
        {assigned && !reachable ? <span className="tag">到達不能</span> : null}
      </div>
      <div className="board mini-board" style={{ width: "218px", height: "107px" }}>
        {keys.map((key) => (
          <div
            className={`key ${overviewKeyClass(key.keycode)}`}
            style={{
              left: `${key.physical.x * 15}px`,
              top: `${key.physical.y * 15}px`,
              width: `${key.physical.width * 13.5}px`,
              height: `${key.physical.height * 13.5}px`,
              transform: `rotate(${key.physical.rotationAngle}deg)`,
              transformOrigin: `${key.physical.rotationX * 15}px ${key.physical.rotationY * 15}px`,
            }}
            key={`${key.position.row}:${key.position.col}`}
            title={`${key.position.row}:${key.position.col} ${key.keycode}`}
          >
            <span className="m">
              {assigned && key.keycode !== "KC_NO" && key.keycode !== "KC_TRNS"
                ? basicLabel(classifyKeycode(key.keycode).kind === "basic" ? key.keycode : "")
                : ""}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function overviewKeyClass(keycode: string): string {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "none":
      return "none";
    case "layerSwitch":
      return lexeme.inner === undefined ? "layer" : "layer-tap";
    case "modified":
      return "mod";
    case "modTap":
    case "oneShotMod":
      return "mod-tap";
    case "tapDance":
      return "tapdance";
    case "custom":
    case "macro":
    case "numeric":
    case "unknown":
      return "custom";
    default:
      return "basic";
  }
}
