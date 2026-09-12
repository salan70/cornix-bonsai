import { rotatePoint } from "../core/definition/parse.ts";
import type { KeyShape } from "../render/geometry.ts";

/** `physical` の幾何だけを持つキー。Vialのviewのkey / Macの盤面entryの両方が満たす。 */
interface NavigableKey {
  readonly physical: KeyShape;
}

/**
 * 方向キーによる盤面内の選択移動。同一layerのキー集合を受け取り、幾何（回転後の
 * キー中心）だけで次のキーを決める。matrixやlayerの概念には依存しない。
 */
export function moveKey<T extends NavigableKey>(
  keys: readonly T[],
  current: T,
  direction: string,
): T | undefined {
  const [x, y] = center(current.physical);
  const filtered = keys.filter((candidate) => {
    if (candidate === current) return false;
    const [candidateX, candidateY] = center(candidate.physical);
    if (direction === "ArrowLeft") return candidateX < x;
    if (direction === "ArrowRight") return candidateX > x;
    if (direction === "ArrowUp") return candidateY < y;
    if (direction === "ArrowDown") return candidateY > y;
    return false;
  });
  return filtered.sort(
    (left, right) => moveScore(left, x, y, direction) - moveScore(right, x, y, direction),
  )[0];
}

function moveScore(candidate: NavigableKey, x: number, y: number, direction: string): number {
  const [candidateX, candidateY] = center(candidate.physical);
  const major =
    direction === "ArrowLeft" || direction === "ArrowRight"
      ? Math.abs(candidateX - x)
      : Math.abs(candidateY - y);
  const minor =
    direction === "ArrowLeft" || direction === "ArrowRight"
      ? Math.abs(candidateY - y)
      : Math.abs(candidateX - x);
  return major + minor * 2;
}

/** 回転を適用した後のキー中心座標。`keyCenter`（PhysicalKey用）と同じ計算。 */
function center(key: KeyShape): readonly [number, number] {
  return rotatePoint(
    key.x + key.width / 2,
    key.y + key.height / 2,
    key.rotationX,
    key.rotationY,
    key.rotationAngle,
  );
}
