// Tool -> covered cells and conflict detection.

import { cellKey } from "./grid";
import type { Tool } from "./types";

/** Edge tolerance: a tool touching a cell boundary does not occupy it. */
export const EDGE_EPS = 0.5;

export interface CoveredCell {
  i: number;
  j: number;
  ok: boolean; // covered cell is active and not taken by mounting hardware
}

export interface ToolOccupancy {
  tool: Tool;
  cells: CoveredCell[];
  conflict: boolean; // at least one covered cell is not active
}

/** Cell range of the tool's full rectangular footprint. */
export function footprintRange(tool: Tool, pitch: number) {
  return {
    i0: Math.floor((tool.x + EDGE_EPS) / pitch),
    i1: Math.floor((tool.x + tool.w - EDGE_EPS) / pitch),
    j0: Math.floor((tool.y + EDGE_EPS) / pitch),
    j1: Math.floor((tool.y + tool.h - EDGE_EPS) / pitch),
  };
}

const NO_MOUNTS: ReadonlySet<string> = new Set();

export function toolOccupancy(
  tool: Tool,
  pitch: number,
  active: ReadonlySet<string>,
  mounts: ReadonlySet<string> = NO_MOUNTS,
): ToolOccupancy {
  const { i0, i1, j0, j1 } = footprintRange(tool, pitch);
  const usable = (i: number, j: number) => {
    const key = cellKey(i, j);
    return active.has(key) && !mounts.has(key);
  };
  const cells: CoveredCell[] = [];
  let conflict = false;
  if (tool.snaps && tool.snaps.length > 0) {
    // snap cells are what mounts the tool; only they must be printed and free
    for (const s of tool.snaps) {
      const i = i0 + s.di;
      const j = j0 + s.dj;
      const ok = usable(i, j);
      if (!ok) conflict = true;
      cells.push({ i, j, ok });
    }
  } else {
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const ok = usable(i, j);
        if (!ok) conflict = true;
        cells.push({ i, j, ok });
      }
    }
  }
  return { tool, cells, conflict };
}

export function allOccupancy(
  tools: readonly Tool[],
  pitch: number,
  active: ReadonlySet<string>,
  mounts: ReadonlySet<string> = NO_MOUNTS,
): ToolOccupancy[] {
  return tools.map((t) => toolOccupancy(t, pitch, active, mounts));
}

/** Geometric intersection of two tool bodies, in world mm. */
export interface ToolOverlap {
  aId: string;
  bId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pairwise body overlaps; edge-touching (within EDGE_EPS) does not count. */
export function toolOverlaps(tools: readonly Tool[]): ToolOverlap[] {
  const out: ToolOverlap[] = [];
  for (let a = 0; a < tools.length; a++) {
    for (let b = a + 1; b < tools.length; b++) {
      const ta = tools[a]!;
      const tb = tools[b]!;
      const x = Math.max(ta.x, tb.x);
      const y = Math.max(ta.y, tb.y);
      const x1 = Math.min(ta.x + ta.w, tb.x + tb.w);
      const y1 = Math.min(ta.y + ta.h, tb.y + tb.h);
      if (x1 - x > EDGE_EPS && y1 - y > EDGE_EPS) {
        out.push({ aId: ta.id, bId: tb.id, x, y, w: x1 - x, h: y1 - y });
      }
    }
  }
  return out;
}

/** Distinct active cells covered by at least one tool. */
export function occupiedCellCount(occ: readonly ToolOccupancy[]): number {
  const seen = new Set<string>();
  for (const o of occ) {
    for (const c of o.cells) if (c.ok) seen.add(cellKey(c.i, c.j));
  }
  return seen.size;
}
