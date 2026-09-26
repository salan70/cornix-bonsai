import { useState } from "react";
import { layerLabel, type WorkspaceLabels } from "../../workspace/labels.ts";

/** layer の色。番号の順に強調色 3 色を巡らせる。色は補助で、番号と名前が識別子になる。 */
export const LAYER_TONES = ["tone-primary", "tone-secondary", "tone-tertiary"] as const;

export function layerTone(layer: number): string {
  return LAYER_TONES[((layer % LAYER_TONES.length) + LAYER_TONES.length) % LAYER_TONES.length]!;
}

/**
 * Cornix LP の layer の切替。参照元の無い layer は既定で畳み、選択中の layer だけは常に出す。
 */
export function CornixLayerBar({
  layerCount,
  hiddenLayers,
  layer,
  labels,
  onLayer,
}: {
  readonly layerCount: number;
  readonly hiddenLayers: readonly number[];
  readonly layer: number;
  readonly labels: WorkspaceLabels;
  readonly onLayer: (layer: number) => void;
}): React.JSX.Element {
  const [showHidden, setShowHidden] = useState(false);
  const hidden = new Set(hiddenLayers);
  const shown = Array.from({ length: layerCount }, (_, index) => index).filter(
    (index) => showHidden || !hidden.has(index) || index === layer,
  );
  return (
    <div className="layerbar">
      <div className="layers" role="radiogroup" aria-label="layer">
        {shown.map((index) => (
          <LayerChip
            key={index}
            layer={index}
            checked={index === layer}
            name={labels.layers.get(index)}
            onLayer={onLayer}
          />
        ))}
      </div>
      {hiddenLayers.length === 0 ? null : (
        <button
          type="button"
          className="link"
          aria-expanded={showHidden}
          onClick={() => setShowHidden((current) => !current)}
        >
          {showHidden ? "参照なしの layer を隠す" : `参照なし ${hiddenLayers.length} 件を表示`}
        </button>
      )}
      <span className="visually-hidden" aria-live="polite">
        {layerLabel(labels, layer)} を表示中
      </span>
    </div>
  );
}

/**
 * Mac の layer の切替。layer 番号は Vial と別の空間で、疎な番号をそのまま並べる。
 */
export function MacLayerBar({
  layers,
  layer,
  nextLayer,
  onLayer,
  onAddLayer,
}: {
  readonly layers: readonly number[];
  readonly layer: number;
  readonly nextLayer: number;
  readonly onLayer: (layer: number) => void;
  readonly onAddLayer: (layer: number) => void;
}): React.JSX.Element {
  return (
    <div className="layerbar">
      <div className="layers" role="radiogroup" aria-label="layer">
        {layers.map((index) => (
          <LayerChip
            key={index}
            layer={index}
            checked={index === layer}
            name={undefined}
            onLayer={onLayer}
          />
        ))}
      </div>
      <button type="button" className="layer layer-add" onClick={() => onAddLayer(nextLayer)}>
        + layer {nextLayer} を追加
      </button>
    </div>
  );
}

function LayerChip({
  layer,
  checked,
  name,
  onLayer,
}: {
  readonly layer: number;
  readonly checked: boolean;
  readonly name: string | undefined;
  readonly onLayer: (layer: number) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-layer={layer}
      className={`layer ${layerTone(layer)}${checked ? " is-on" : ""}`}
      onClick={() => onLayer(layer)}
    >
      L{layer}
      {name === undefined ? null : <span>{name}</span>}
    </button>
  );
}
