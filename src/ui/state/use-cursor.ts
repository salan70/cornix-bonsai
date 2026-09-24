import { useState } from "react";
import type { PickTarget } from "../keycode-compose.ts";
import { targetKeyOf, type EditTarget, type Selection, type TargetKey } from "../types.ts";

/**
 * 編集の現在地。編集対象と、対象ごとの layer・選択・picker の適用先を持つ。
 *
 * Mac の layer 番号空間は Vial と別なので、対象を切り替えても互いの現在地を上書きしない（ADR 0025）。
 *
 * @doc docs/specs/ui.md#状態の持ち方
 */
export function useCursor(): {
  readonly target: EditTarget;
  readonly setTarget: (target: EditTarget) => void;
  readonly key: TargetKey;
  readonly layer: number;
  readonly setLayer: (layer: number) => void;
  readonly setLayerOf: (key: TargetKey, layer: number) => void;
  readonly selection: Selection | undefined;
  readonly setSelection: (selection: Selection | undefined) => void;
  readonly pickTarget: PickTarget;
  readonly setPickTarget: (target: PickTarget) => void;
} {
  const [target, setTarget] = useState<EditTarget>({ kind: "cornix" });
  const [layers, setLayers] = useState<Readonly<Record<TargetKey, number>>>({
    cornix: 0,
    ansi: 0,
    jis: 0,
  });
  const [selections, setSelections] = useState<Readonly<Record<TargetKey, Selection | undefined>>>({
    cornix: undefined,
    ansi: undefined,
    jis: undefined,
  });
  const [pickTargets, setPickTargets] = useState<Readonly<Record<TargetKey, PickTarget>>>({
    cornix: "whole",
    ansi: "whole",
    jis: "whole",
  });
  const key = targetKeyOf(target);

  function setLayerOf(targetKey: TargetKey, layer: number): void {
    setLayers((current) => ({ ...current, [targetKey]: layer }));
  }

  return {
    target,
    setTarget,
    key,
    layer: layers[key],
    setLayer: (layer) => setLayerOf(key, layer),
    setLayerOf,
    selection: selections[key],
    setSelection: (selection) => setSelections((current) => ({ ...current, [key]: selection })),
    pickTarget: pickTargets[key],
    setPickTarget: (pickTarget) => setPickTargets((current) => ({ ...current, [key]: pickTarget })),
  };
}
