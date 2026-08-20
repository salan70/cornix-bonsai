import { isAbsent, type VilDocument, type VilTapDanceEntry } from "../core/vil/types.ts";
import { classifyKeycode, type LayerAction } from "../core/validation/keycode-vocabulary.ts";
import { collectReferenceUsage } from "../core/validation/reference-usage.ts";

/** Overview上でlayer遷移を示す参照元の種別。 */
export type OverviewLayerReferenceSourceKind = "key" | "encoder" | "tapDance" | "combo";

/** Overview上でlayer遷移を示す参照元。 */
export interface OverviewLayerReferenceSource {
  readonly kind: OverviewLayerReferenceSourceKind;
  readonly id: string;
  readonly layer?: number;
  readonly row?: number;
  readonly col?: number;
  readonly index?: number;
  readonly direction?: "ccw" | "cw";
  readonly field?: number;
  readonly keycode: string;
}

/** layer遷移keycode 1個から導いたOverview上の参照。 */
export interface OverviewLayerReference {
  readonly source: OverviewLayerReferenceSource;
  readonly targetLayer: number;
  readonly action: LayerAction;
}

/** 使用中TapDanceの表示用情報。 */
export interface OverviewTapDance {
  readonly index: number;
  readonly usageCount: number;
  readonly entry: VilTapDanceEntry;
}

/** Overviewが表示するlayerと参照関係の純粋な派生モデル。 */
export interface OverviewModel {
  readonly layerCount: number;
  readonly visibleLayers: readonly number[];
  readonly hiddenLayers: readonly number[];
  readonly references: readonly OverviewLayerReference[];
  readonly referencesByTarget: ReadonlyMap<number, readonly OverviewLayerReference[]>;
  readonly tapDances: readonly OverviewTapDance[];
}

/**
 * documentからOverview専用の表示モデルを作る。
 *
 * ここでの「使用中」は割り当ての有無や既存のreachability診断ではなく、layer 0または
 * keycode領域から参照されていることを指す。TapDance/Combo内のlayer操作も含めるが、
 * 既存のreachability解析とvalidationの結果は変更しない。
 *
 * @doc docs/specs/ui.md#overview-layer-grid
 */
export function buildOverviewModel(document: VilDocument): OverviewModel {
  const references: OverviewLayerReference[] = [];

  document.layout.forEach((layer, layerIndex) => {
    layer.forEach((row, rowIndex) => {
      row.forEach((entry, colIndex) => {
        if (isAbsent(entry)) return;
        collectLayerReferences(
          entry,
          {
            kind: "key",
            id: `key:${layerIndex}:${rowIndex}:${colIndex}`,
            layer: layerIndex,
            row: rowIndex,
            col: colIndex,
            keycode: entry,
          },
          references,
        );
      });
    });
  });

  document.encoderLayout.forEach((layer, layerIndex) => {
    layer.forEach((encoder, encoderIndex) => {
      encoder.forEach((keycode, direction) => {
        collectLayerReferences(
          keycode,
          {
            kind: "encoder",
            id: `encoder:${layerIndex}:${encoderIndex}:${direction}`,
            layer: layerIndex,
            index: encoderIndex,
            direction: direction === 0 ? "ccw" : "cw",
            keycode,
          },
          references,
        );
      });
    });
  });

  document.tapDance.forEach((entry, index) => {
    entry.slice(0, 4).forEach((keycode, field) => {
      collectLayerReferences(
        keycode as string,
        {
          kind: "tapDance",
          id: `tapDance:${index}:${field}`,
          index,
          field,
          keycode: keycode as string,
        },
        references,
      );
    });
  });

  document.combo.forEach((entry, index) => {
    entry.forEach((keycode, field) => {
      collectLayerReferences(
        keycode,
        {
          kind: "combo",
          id: `combo:${index}:${field}`,
          index,
          field,
          keycode,
        },
        references,
      );
    });
  });

  const referencesByTarget = new Map<number, OverviewLayerReference[]>();
  for (const reference of references) {
    const target = referencesByTarget.get(reference.targetLayer) ?? [];
    target.push(reference);
    referencesByTarget.set(reference.targetLayer, target);
  }

  const visible = new Set<number>([0]);
  for (const target of referencesByTarget.keys()) {
    if (target >= 0 && target < document.layout.length) visible.add(target);
  }
  const visibleLayers = [...visible].sort((a, b) => a - b);
  const hiddenLayers = Array.from({ length: document.layout.length }, (_, layer) => layer).filter(
    (layer) => !visible.has(layer),
  );

  const usage = collectReferenceUsage(document);
  const tapDances = [...usage.tapDance.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([index, usageCount]) => {
      const entry = document.tapDance[index];
      return entry === undefined ? [] : [{ index, usageCount, entry }];
    });

  return {
    layerCount: document.layout.length,
    visibleLayers,
    hiddenLayers,
    references,
    referencesByTarget,
    tapDances,
  };
}

function collectLayerReferences(
  keycode: string,
  source: OverviewLayerReferenceSource,
  references: OverviewLayerReference[],
): void {
  const lexeme = classifyKeycode(keycode);
  switch (lexeme.kind) {
    case "layerSwitch":
      references.push({
        source: { ...source, keycode },
        targetLayer: lexeme.layer,
        action: lexeme.action,
      });
      if (lexeme.inner !== undefined) collectLayerReferences(lexeme.inner, source, references);
      return;
    case "modified":
    case "modTap":
      collectLayerReferences(lexeme.inner, source, references);
      return;
    default:
      return;
  }
}
