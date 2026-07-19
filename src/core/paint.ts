// Active-cell set operations and derived stats. Pure (set in, set out) so a
// command/undo layer can wrap them later.

import { parseCellKey } from "./grid";
import type { Bounds } from "./types";

/** Returns the same set when nothing changes, a new set otherwise. */
export function withCell(
  active: ReadonlySet<string>,
  key: string,
  value: boolean,
): ReadonlySet<string> {
  if (active.has(key) === value) return active;
  const next = new Set(active);
  if (value) next.add(key);
  else next.delete(key);
  return next;
}

export interface CellBounds {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

/** Bounding box of the active set in cell indices, null when empty. */
export function activeCellBounds(active: ReadonlySet<string>): CellBounds | null {
  let r: CellBounds | null = null;
  for (const key of active) {
    const { i, j } = parseCellKey(key);
    if (!r) r = { i0: i, j0: j, i1: i, j1: j };
    else {
      r.i0 = Math.min(r.i0, i);
      r.j0 = Math.min(r.j0, j);
      r.i1 = Math.max(r.i1, i);
      r.j1 = Math.max(r.j1, j);
    }
  }
  return r;
}

/** Same bounding box in world mm. */
export function activeWorldBounds(
  active: ReadonlySet<string>,
  pitch: number,
): Bounds | null {
  const cb = activeCellBounds(active);
  if (!cb) return null;
  return {
    x0: cb.i0 * pitch,
    y0: cb.j0 * pitch,
    x1: (cb.i1 + 1) * pitch,
    y1: (cb.j1 + 1) * pitch,
  };
}

export function activeAreaM2(active: ReadonlySet<string>, pitch: number): number {
  return (active.size * pitch * pitch) / 1e6;
}
