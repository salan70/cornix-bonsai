/**
 * 到達性解析。layer を node、layer 操作 keycode を edge とする有向グラフを組み、
 * base layer（layer 0）から辿る。
 *
 * definition を引数に取らない。layer の到達性は座標ではなく keycode だけで決まるため、
 * definition を渡すと「無くても答えが出る依存」を作ることになる。
 *
 * **この解析は保守的に不完全である**。combo・tap dance・key override・alt repeat key 経由の
 * layer 遷移を見ていない。したがって結果は error にできない。閉じ込め判定を warning にして
 * 人間が越えられる形にしているのはこのため（ADR 0010）。
 */

import { isAbsent, type VilDocument } from "../vil/types.ts";
import { classifyKeycode, isMomentaryLayerAction } from "./keycode-vocabulary.ts";
import { createDiagnostic, type Diagnostic } from "./types.ts";

/** layer 間の遷移。 */
export interface LayerEdge {
  readonly from: number;
  readonly to: number;
  /** 押している間だけ有効か（`MO` / `LT` / `LM`）。 */
  readonly momentary: boolean;
}

/** 到達性解析の結果。診断へ落とす前の中間表現で、rendering や CLI からも読める。 */
export interface ReachabilityResult {
  readonly reachable: ReadonlySet<number>;
  readonly edges: readonly LayerEdge[];
  /** 割り当てが 1 つも無い layer（`KC_TRNS` / `KC_NO` / `-1` だけ）。 */
  readonly emptyLayers: readonly number[];
}

/**
 * layer 番号 → その layer に置かれた keycode の列から到達性を求める。
 *
 * `VilDocument` を取らない。到達性は keycode だけで決まるので、matrix を持つ device に
 * 限る理由が無い。MacBook 内蔵キーボードの疎な map（ADR 0022）からも同じ解析を使う。
 *
 * @doc docs/specs/validation.md#analyzelayergraph
 */
export function analyzeLayerGraph(
  layers: ReadonlyMap<number, readonly string[]>,
): ReachabilityResult {
  const edges: LayerEdge[] = [];
  const emptyLayers: number[] = [];

  for (const [from, keycodes] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    let assigned = false;
    for (const keycode of keycodes) {
      const lexeme = classifyKeycode(keycode);
      if (lexeme.kind !== "none" && lexeme.kind !== "transparent") assigned = true;
      if (lexeme.kind !== "layerSwitch") continue;
      if (lexeme.layer === from) continue;
      edges.push({ from, to: lexeme.layer, momentary: isMomentaryLayerAction(lexeme.action) });
    }
    if (!assigned) emptyLayers.push(from);
  }

  const reachable = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const edge of edges) {
      if (edge.from !== current || reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      queue.push(edge.to);
    }
  }

  return { reachable, edges, emptyLayers };
}

/**
 * layer グラフを組んで到達性を求める。
 *
 * @doc docs/specs/validation.md#analyzereachability
 */
export function analyzeReachability(document: VilDocument): ReachabilityResult {
  const layers = new Map<number, readonly string[]>();
  document.layout.forEach((layer, index) => {
    const keycodes: string[] = [];
    for (const row of layer) {
      for (const entry of row) {
        if (isAbsent(entry)) continue;
        keycodes.push(entry);
      }
    }
    for (const encoder of document.encoderLayout[index] ?? []) {
      keycodes.push(...encoder);
    }
    layers.set(index, keycodes);
  });
  return analyzeLayerGraph(layers);
}

/**
 * 到達性の結果を診断へ落とす。
 *
 * - 到達できない layer に割り当てがある: information。**実 fixture で較正した結果**、
 *   `baseline.vil`（実機の export）が 5 件出す。書けば書いたとおりに入り、失われる値も無い。
 *   設計上の指摘であって Apply を止める事実ではない（ADR 0010）
 * - 出口の無い layer へ持続的に入れる: warning。実機が操作不能になりうる
 * - 割り当ての無い layer: information。未使用なだけで壊れていない
 *
 * @doc docs/specs/validation.md#reachability-diagnostics
 */
export function toReachabilityDiagnostics(
  document: VilDocument,
  result: ReachabilityResult = analyzeReachability(document),
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const empty = new Set(result.emptyLayers);

  for (let layer = 1; layer < document.layout.length; layer++) {
    if (result.reachable.has(layer) || empty.has(layer)) continue;
    diagnostics.push(
      createDiagnostic(
        "reachability/unreachable-layer",
        "information",
        { kind: "layer", layer },
        `layer ${layer} に割り当てがあるが、layer 0 から辿り着く keycode が無い`,
        { layer },
      ),
    );
  }

  for (const layer of result.reachable) {
    if (layer === 0) continue;
    const enteredPersistently = result.edges.some((edge) => edge.to === layer && !edge.momentary);
    const hasExit = result.edges.some((edge) => edge.from === layer);
    if (!enteredPersistently || hasExit) continue;
    diagnostics.push(
      createDiagnostic(
        "reachability/trapped-layer",
        "warning",
        { kind: "layer", layer },
        `layer ${layer} は TO / TG / DF で入れるが、他の layer へ移る keycode が 1 つも無い`,
        { layer },
      ),
    );
  }

  for (const layer of result.emptyLayers) {
    if (layer === 0) continue;
    diagnostics.push(
      createDiagnostic(
        "reachability/empty-layer",
        "information",
        { kind: "layer", layer },
        `layer ${layer} には割り当てが無い`,
        { layer },
      ),
    );
  }

  return diagnostics;
}
