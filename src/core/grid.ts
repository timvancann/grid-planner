// Cell indexing and grid line generation. Cell key encode/decode is
// centralized here so finer granularity (half-cells, edges) can be added
// later without "i,j" strings being load-bearing elsewhere.

import type { Bounds } from "./types";

export interface CellIndex {
  i: number;
  j: number;
}

export function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

export function parseCellKey(key: string): CellIndex {
  const c = key.indexOf(",");
  return { i: Number(key.slice(0, c)), j: Number(key.slice(c + 1)) };
}

/** Cell containing world point (x, y). Math.floor keeps negatives correct. */
export function cellAt(x: number, y: number, pitch: number): CellIndex {
  return { i: Math.floor(x / pitch), j: Math.floor(y / pitch) };
}

export function cellKeyAt(x: number, y: number, pitch: number): string {
  const c = cellAt(x, y, pitch);
  return cellKey(c.i, c.j);
}

export interface GridLines {
  v: number[]; // world x of vertical lines
  h: number[]; // world y of horizontal lines
  step: number; // 1 = every line, 5 = decimated
}

export const DECIMATE_BELOW_PX = 6;
export const MAX_LINES_PER_AXIS = 600;

/** Grid lines across the visible bounds only, decimated when zoomed out. */
export function gridLines(b: Bounds, pitch: number, ppm: number): GridLines {
  const step = pitch * ppm < DECIMATE_BELOW_PX ? 5 : 1;
  const s = pitch * step;
  const i0 = Math.floor(b.x0 / s);
  const i1 = Math.ceil(b.x1 / s);
  const j0 = Math.floor(b.y0 / s);
  const j1 = Math.ceil(b.y1 / s);
  if (i1 - i0 > MAX_LINES_PER_AXIS || j1 - j0 > MAX_LINES_PER_AXIS) {
    return { v: [], h: [], step };
  }
  const v: number[] = [];
  const h: number[] = [];
  for (let i = i0; i <= i1; i++) v.push(i * s);
  for (let j = j0; j <= j1; j++) h.push(j * s);
  return { v, h, step };
}
