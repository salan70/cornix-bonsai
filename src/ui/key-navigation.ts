import { keyCenter } from "../core/definition/parse.ts";
import type { buildKeymapView } from "../core/model/keymap-view.ts";

export function moveKey(
  view: ReturnType<typeof buildKeymapView>,
  current: (typeof view.keys)[number],
  direction: string,
): (typeof view.keys)[number] | undefined {
  const [x, y] = keyCenter(current.physical);
  const candidates = view.keys.filter(
    (key) => key.position.layer === current.position.layer && key !== current,
  );
  const filtered = candidates.filter((candidate) => {
    const [candidateX, candidateY] = keyCenter(candidate.physical);
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

function moveScore(
  candidate: ReturnType<typeof buildKeymapView>["keys"][number],
  x: number,
  y: number,
  direction: string,
): number {
  const [candidateX, candidateY] = keyCenter(candidate.physical);
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
