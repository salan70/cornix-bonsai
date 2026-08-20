import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { createKeycodeTable } from "../../core/keycode/table.ts";
import type { buildKeymapView } from "../../core/model/keymap-view.ts";
import { analyzeReachability } from "../../core/validation/reachability.ts";
import type { VilDocument } from "../../core/vil/types.ts";
import { boardMetrics, boardSize, keyBox } from "../../render/geometry.ts";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";
import {
  buildOverviewModel,
  type OverviewLayerReference,
  type OverviewModel,
} from "../overview-model.ts";
import { keycodeClass, keycodeDisplay, renderKeycode } from "../keycode-display.tsx";

const LAYER_COLORS = [
  "var(--layer-link-0)",
  "var(--layer-link-1)",
  "var(--layer-link-2)",
  "var(--layer-link-3)",
  "var(--layer-link-4)",
  "var(--layer-link-5)",
  "var(--layer-link-6)",
  "var(--layer-link-7)",
];

/** @doc docs/specs/ui.md#overview-layer-grid */
export function Overview({
  document,
  definition,
  labels,
  view,
  onEditLayerLabel,
}: {
  readonly document: VilDocument;
  readonly definition: Parameters<typeof createKeycodeTable>[0];
  readonly labels: WorkspaceLabels;
  readonly view: ReturnType<typeof buildKeymapView>;
  readonly onEditLayerLabel: (layer: number, value: string) => void;
}): JSX.Element {
  const [showUnused, setShowUnused] = useState(false);
  const [activeRelation, setActiveRelation] = useState<string | undefined>();
  const overview = buildOverviewModel(document);
  const reachability = analyzeReachability(document);
  const table = createKeycodeTable(definition, view.capacities);
  const visibleLayers = showUnused
    ? Array.from({ length: overview.layerCount }, (_, layer) => layer)
    : overview.visibleLayers;
  const referencesBySource = referencesBySourceId(overview);
  const activeReference = findReference(overview, activeRelation);
  const canvasRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef(new Map<string, HTMLElement>());
  const targetRefs = useRef(new Map<number, HTMLElement>());
  const [connector, setConnector] = useState<Connector | undefined>();

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || activeReference === undefined) {
      setConnector(undefined);
      return;
    }
    const update = (): void => {
      const source = sourceRefs.current.get(activeReference.source.id);
      const target = targetRefs.current.get(activeReference.targetLayer);
      if (source === undefined || target === undefined) {
        setConnector(undefined);
        return;
      }
      const canvasRect = canvas.getBoundingClientRect();
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setConnector({
        x1: sourceRect.left + sourceRect.width / 2 - canvasRect.left,
        y1: sourceRect.top + sourceRect.height / 2 - canvasRect.top,
        x2: targetRect.left + targetRect.width / 2 - canvasRect.left,
        y2: targetRect.top + targetRect.height / 2 - canvasRect.top,
      });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(canvas);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeReference, visibleLayers]);

  function setSourceRef(id: string, element: HTMLElement | null): void {
    if (element === null) sourceRefs.current.delete(id);
    else sourceRefs.current.set(id, element);
  }

  function setTargetRef(layer: number, element: HTMLElement | null): void {
    if (element === null) targetRefs.current.delete(layer);
    else targetRefs.current.set(layer, element);
  }

  function activate(reference: OverviewLayerReference): void {
    setActiveRelation(referenceId(reference));
  }

  function clearRelation(): void {
    setActiveRelation(undefined);
  }

  return (
    <section className="overview-page">
      <div className="overview-toolbar">
        <span className="disc">
          参照あり {overview.visibleLayers.length} / {overview.layerCount} layer
        </span>
        {overview.hiddenLayers.length > 0 ? (
          <label className="overview-toggle">
            <input
              type="checkbox"
              checked={showUnused}
              onChange={(event) => setShowUnused(event.target.checked)}
            />
            参照なし {overview.hiddenLayers.length} layerを表示
          </label>
        ) : null}
        <div className="grow" />
        <button className="btn" disabled>
          ⇧ SVG で書き出す
        </button>
        <button className="btn" disabled>
          ⇧ PDF で書き出す
        </button>
      </div>
      <div className="overview-canvas" ref={canvasRef}>
        <div className="overview-dashboard">
          <div className="overview-grid">
            {visibleLayers.map((layer) => (
              <LayerCard
                key={layer}
                layer={layer}
                label={layerLabel(labels, layer)}
                namedLabel={labels.layers.get(layer)}
                keys={view.keys.filter((key) => key.position.layer === layer)}
                encoders={view.encoders.filter((encoder) => encoder.layer === layer)}
                labels={labels}
                table={table}
                references={overview.referencesByTarget.get(layer) ?? []}
                referencesBySource={referencesBySource}
                reachable={reachability.reachable.has(layer)}
                activeRelation={activeRelation}
                setTargetRef={setTargetRef}
                setSourceRef={setSourceRef}
                activate={activate}
                clearRelation={clearRelation}
                onEditLayerLabel={onEditLayerLabel}
              />
            ))}
          </div>
          <TapDanceSidebar
            model={overview}
            labels={labels}
            table={table}
            activeRelation={activeRelation}
            referencesBySource={referencesBySource}
            setSourceRef={setSourceRef}
            activate={activate}
            clearRelation={clearRelation}
          />
        </div>
        {connector === undefined || activeReference === undefined ? null : (
          <svg className="overview-connectors" aria-hidden="true">
            <line
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
              style={{ stroke: layerColor(activeReference.targetLayer) }}
            />
          </svg>
        )}
      </div>
      <div className="note overview-note">
        layer名はこの画面で編集できます。キー・encoder・Tap Danceの編集は各専用画面で行います。
      </div>
    </section>
  );
}

function LayerCard({
  layer,
  label,
  namedLabel,
  keys,
  encoders,
  labels,
  table,
  references,
  referencesBySource,
  reachable,
  activeRelation,
  setTargetRef,
  setSourceRef,
  activate,
  clearRelation,
  onEditLayerLabel,
}: {
  readonly layer: number;
  readonly label: string;
  readonly namedLabel: string | undefined;
  readonly keys: readonly ReturnType<typeof buildKeymapView>["keys"][number][];
  readonly encoders: readonly ReturnType<typeof buildKeymapView>["encoders"][number][];
  readonly labels: WorkspaceLabels;
  readonly table: ReturnType<typeof createKeycodeTable>;
  readonly references: readonly OverviewLayerReference[];
  readonly referencesBySource: ReadonlyMap<string, OverviewLayerReference>;
  readonly reachable: boolean;
  readonly activeRelation: string | undefined;
  readonly setTargetRef: (layer: number, element: HTMLElement | null) => void;
  readonly setSourceRef: (id: string, element: HTMLElement | null) => void;
  readonly activate: (reference: OverviewLayerReference) => void;
  readonly clearRelation: () => void;
  readonly onEditLayerLabel: (layer: number, value: string) => void;
}): JSX.Element {
  const metrics = boardMetrics(keys.map((key) => key.physical));
  const boardHostRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const scaleUnit =
    metrics.width === 0
      ? 18
      : Math.min(24, Math.max(14, Math.floor((availableWidth || 280) / metrics.width)));
  const scale = { unit: scaleUnit, gap: Math.max(1, Math.round(scaleUnit * 0.07)) };
  const size = boardSize(metrics, scale);

  useEffect(() => {
    const element = boardHostRef.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setAvailableWidth(width);
    });
    observer.observe(element);
    setAvailableWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      className={`overview-card ${reachable || layer === 0 ? "" : "unreachable"}`}
      ref={(element) => setTargetRef(layer, element)}
      style={{ "--layer-color": layerColor(layer) } as CSSProperties}
    >
      <div className="overview-heading">
        <LayerNameEditor
          layer={layer}
          label={label}
          namedLabel={namedLabel}
          onCommit={onEditLayerLabel}
        />
        <span className="mono muted">L{layer}</span>
        <div className="grow" />
        {layer !== 0 && references.length === 0 ? <span className="tag">参照なし</span> : null}
        {layer !== 0 && references.length > 0 && !reachable ? (
          <span className="tag">到達不能</span>
        ) : null}
      </div>
      <div className="overview-reference-summary">{referenceSummary(references)}</div>
      <div className="overview-board-host" ref={boardHostRef}>
        <div
          className="board mini-board"
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
            ["--cap-font" as string]: `${Math.max(5, Math.round(scale.unit * 0.28))}px`,
            ["--cap-sub-font" as string]: `${Math.max(4, Math.round(scale.unit * 0.2))}px`,
          }}
        >
          {keys.map((key) => {
            const box = keyBox(key.physical, metrics, scale);
            const display = keycodeDisplay(key.keycode, labels, table, { compact: true });
            const relation = referencesBySource.get(
              `key:${key.position.layer}:${key.position.row}:${key.position.col}`,
            );
            return (
              <OverviewKey
                key={`${key.position.row}:${key.position.col}`}
                className={`key ${keycodeClass(key.keycode)}`}
                style={{
                  left: `${box.left}px`,
                  top: `${box.top}px`,
                  width: `${box.width}px`,
                  height: `${box.height}px`,
                  transform: `rotate(${box.angle}deg)`,
                  transformOrigin: `${box.originX}px ${box.originY}px`,
                }}
                display={display}
                raw={key.keycode}
                relation={relation}
                activeRelation={activeRelation}
                setSourceRef={setSourceRef}
                activate={activate}
                clearRelation={clearRelation}
              />
            );
          })}
        </div>
      </div>
      <div className="overview-encoders" aria-label={`layer ${layer} encoders`}>
        {encoders.length === 0 ? <span className="muted">encoderなし</span> : null}
        {[...new Set(encoders.map((encoder) => encoder.index))]
          .sort((left, right) => left - right)
          .map((index) => (
            <div className="overview-encoder" key={index}>
              <span className="note">E{index}</span>
              <div className="overview-encoder-pair">
                {(["ccw", "cw"] as const).map((direction) => {
                  const encoder = encoders.find(
                    (candidate) => candidate.index === index && candidate.direction === direction,
                  );
                  if (encoder === undefined) return null;
                  const relation = referencesBySource.get(
                    `encoder:${layer}:${index}:${direction === "ccw" ? 0 : 1}`,
                  );
                  return (
                    <OverviewKey
                      key={direction}
                      className={`overview-encoder-key ${keycodeClass(encoder.keycode)}`}
                      style={{}}
                      display={keycodeDisplay(encoder.keycode, labels, table, { compact: true })}
                      raw={encoder.keycode}
                      prefix={direction === "ccw" ? "↺ " : "↻ "}
                      relation={relation}
                      activeRelation={activeRelation}
                      setSourceRef={setSourceRef}
                      activate={activate}
                      clearRelation={clearRelation}
                    />
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </article>
  );
}

function OverviewKey({
  className,
  style,
  display,
  raw,
  prefix = "",
  relation,
  activeRelation,
  setSourceRef,
  activate,
  clearRelation,
}: {
  readonly className: string;
  readonly style: CSSProperties;
  readonly display: { readonly primary: string; readonly role?: string };
  readonly raw: string;
  readonly prefix?: string;
  readonly relation: OverviewLayerReference | undefined;
  readonly activeRelation: string | undefined;
  readonly setSourceRef: (id: string, element: HTMLElement | null) => void;
  readonly activate: (reference: OverviewLayerReference) => void;
  readonly clearRelation: () => void;
}): JSX.Element {
  const relationId = relation === undefined ? undefined : referenceId(relation);
  const isActive = relationId !== undefined && relationId === activeRelation;
  const relationStyle =
    relation === undefined
      ? style
      : ({ ...style, "--layer-color": layerColor(relation.targetLayer) } as CSSProperties);
  return (
    <div
      className={`${className}${relation === undefined ? "" : " overview-related-source"}${isActive ? " related-active" : ""}`}
      style={relationStyle}
      ref={(element) =>
        relation === undefined ? undefined : setSourceRef(relation.source.id, element)
      }
      tabIndex={relation === undefined ? undefined : 0}
      aria-label={relation === undefined ? undefined : relationLabel(relation)}
      title={capTitle(display, raw)}
      onPointerEnter={relation === undefined ? undefined : () => activate(relation)}
      onPointerLeave={relation === undefined ? undefined : clearRelation}
      onFocus={relation === undefined ? undefined : () => activate(relation)}
      onBlur={relation === undefined ? undefined : clearRelation}
    >
      {renderKeycode(display, prefix)}
    </div>
  );
}

function TapDanceSidebar({
  model,
  labels,
  table,
  activeRelation,
  referencesBySource,
  setSourceRef,
  activate,
  clearRelation,
}: {
  readonly model: OverviewModel;
  readonly labels: WorkspaceLabels;
  readonly table: ReturnType<typeof createKeycodeTable>;
  readonly activeRelation: string | undefined;
  readonly referencesBySource: ReadonlyMap<string, OverviewLayerReference>;
  readonly setSourceRef: (id: string, element: HTMLElement | null) => void;
  readonly activate: (reference: OverviewLayerReference) => void;
  readonly clearRelation: () => void;
}): JSX.Element {
  return (
    <aside className="overview-tapdance panel">
      <div className="panel-heading">
        <h2>使用中の Tap Dance</h2>
        <span className="muted">{model.tapDances.length}件</span>
      </div>
      {model.tapDances.length === 0 ? (
        <p className="note">参照されているTap Danceはありません。</p>
      ) : null}
      {model.tapDances.map(({ index, usageCount, entry }) => (
        <fieldset key={index} className="overview-tapdance-entry">
          <legend>
            {keycodeLabelOrRaw(labels, `TD(${index})`)}{" "}
            <span className="muted">({usageCount} usages)</span>
          </legend>
          {entry.slice(0, 4).map((keycode, field) => {
            const relation = referencesBySource.get(`tapDance:${index}:${field}`);
            return (
              <div className="overview-tapdance-row" key={field}>
                <span className="overview-tapdance-field">{tapDanceFieldLabel(field)}</span>
                <OverviewKey
                  className="overview-tapdance-value"
                  style={{}}
                  display={keycodeDisplay(keycode as string, labels, table, { compact: false })}
                  raw={keycode as string}
                  relation={relation}
                  activeRelation={activeRelation}
                  setSourceRef={setSourceRef}
                  activate={activate}
                  clearRelation={clearRelation}
                />
              </div>
            );
          })}
          <div className="overview-tapdance-row">
            <span className="overview-tapdance-field">timeout</span>
            <span>{entry[4]} ms</span>
          </div>
        </fieldset>
      ))}
      <p className="note overview-tapdance-note">詳細編集はBehaviorsタブで行います。</p>
    </aside>
  );
}

function LayerNameEditor({
  layer,
  label,
  namedLabel,
  onCommit,
}: {
  readonly layer: number;
  readonly label: string;
  readonly namedLabel: string | undefined;
  readonly onCommit: (layer: number, value: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(namedLabel ?? "");
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(namedLabel ?? "");
  }, [editing, namedLabel]);

  if (!editing) {
    return (
      <button
        className="overview-layer-name"
        type="button"
        title={`${label} の名前を編集`}
        aria-label={`${label} の名前を編集`}
        onClick={() => setEditing(true)}
      >
        {label} <span aria-hidden="true">✎</span>
      </button>
    );
  }

  return (
    <input
      className="overview-layer-name-input"
      aria-label={`layer ${layer} の名前`}
      value={draft}
      placeholder={`layer ${layer}`}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(layer, draft);
          setEditing(false);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        onCommit(layer, draft);
        setEditing(false);
      }}
    />
  );
}

interface Connector {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

function referencesBySourceId(model: OverviewModel): ReadonlyMap<string, OverviewLayerReference> {
  const result = new Map<string, OverviewLayerReference>();
  for (const reference of model.references) {
    if (reference.targetLayer < 0 || reference.targetLayer >= model.layerCount) continue;
    if (!result.has(reference.source.id)) result.set(reference.source.id, reference);
  }
  return result;
}

function findReference(
  model: OverviewModel,
  id: string | undefined,
): OverviewLayerReference | undefined {
  if (id === undefined) return undefined;
  return model.references.find((reference) => referenceId(reference) === id);
}

function referenceId(reference: OverviewLayerReference): string {
  return `${reference.source.id}->${reference.targetLayer}`;
}

function referenceSummary(references: readonly OverviewLayerReference[]): string {
  if (references.length === 0) return "参照元なし";
  const counts = new Map<string, number>();
  for (const reference of references) {
    const label =
      reference.source.kind === "key"
        ? "キー"
        : reference.source.kind === "encoder"
          ? "encoder"
          : reference.source.kind === "tapDance"
            ? "TD"
            : "Combo";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return `参照元: ${[...counts.entries()].map(([kind, count]) => `${kind} ${count}`).join(" / ")}`;
}

function relationLabel(reference: OverviewLayerReference): string {
  const source = reference.source;
  const sourceLabel =
    source.kind === "key"
      ? `layer ${source.layer} row ${source.row} col ${source.col}`
      : source.kind === "encoder"
        ? `layer ${source.layer} encoder ${source.index} ${source.direction}`
        : source.kind === "tapDance"
          ? `Tap Dance ${source.index} ${tapDanceFieldLabel(source.field ?? 0)}`
          : `Combo ${source.index} field ${(source.field ?? 0) + 1}`;
  return `${sourceLabel}: ${source.keycode} → layer ${reference.targetLayer}`;
}

function layerColor(layer: number): string {
  return (
    LAYER_COLORS[((layer % LAYER_COLORS.length) + LAYER_COLORS.length) % LAYER_COLORS.length] ??
    "var(--accent-emphasis)"
  );
}

function keycodeLabelOrRaw(labels: WorkspaceLabels, keycode: string): string {
  return labels.keycodes.get(keycode) ?? keycode;
}

function tapDanceFieldLabel(field: number): string {
  return ["tap", "hold", "double tap", "hold after tap"][field] ?? `field ${field}`;
}

function capTitle(
  display: { readonly primary: string; readonly role?: string },
  keycode: string,
): string {
  const head =
    display.role === undefined ? display.primary : `${display.primary} / ${display.role}`;
  return `${head} (${keycode})`;
}
