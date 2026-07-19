// Print-tile segmentation: cover the painted cell set with rectangles no
// larger than the printer bed. Minimal rectangle cover is NP-hard in general;
// this uses a balanced grid cut, which is near-optimal for typical layouts
// and, unlike a greedy cover, yields evenly sized prints (a 7-cell span on a
// 6-cell bed becomes 4+3, not 6+1).

import { cellKey } from "./grid";
import { activeCellBounds } from "./paint";
import type { BedSize } from "./types";

/** A print tile in cell coordinates. */
export interface Tile {
  i0: number;
  j0: number;
  w: number; // cells
  h: number;
}

/** Split `total` into ceil(total/max) parts, each <= max, as even as possible. */
export function balancedParts(total: number, max: number): number[] {
  const k = Math.ceil(total / max);
  const base = Math.floor(total / k);
  const rem = total % k;
  // rem parts of (base+1), then k-rem parts of base
  return Array.from({ length: k }, (_, n) => (n < rem ? base + 1 : base));
}

/**
 * Balanced-cut segmentation of the active set. Each tile is trimmed to the
 * bounding box of the painted cells it contains; tiles without painted cells
 * are dropped.
 */
export function segmentActive(active: ReadonlySet<string>, bed: BedSize): Tile[] {
  const bb = activeCellBounds(active);
  if (!bb) return [];
  const colWidths = balancedParts(bb.i1 - bb.i0 + 1, Math.max(1, Math.floor(bed.w)));
  const rowHeights = balancedParts(bb.j1 - bb.j0 + 1, Math.max(1, Math.floor(bed.h)));

  const tiles: Tile[] = [];
  let j = bb.j0;
  for (const h of rowHeights) {
    let i = bb.i0;
    for (const w of colWidths) {
      // trim the cut rectangle to its painted content
      let ti0 = Infinity;
      let tj0 = Infinity;
      let ti1 = -Infinity;
      let tj1 = -Infinity;
      for (let ci = i; ci < i + w; ci++) {
        for (let cj = j; cj < j + h; cj++) {
          if (!active.has(cellKey(ci, cj))) continue;
          ti0 = Math.min(ti0, ci);
          tj0 = Math.min(tj0, cj);
          ti1 = Math.max(ti1, ci);
          tj1 = Math.max(tj1, cj);
        }
      }
      if (ti0 !== Infinity) {
        tiles.push({ i0: ti0, j0: tj0, w: ti1 - ti0 + 1, h: tj1 - tj0 + 1 });
      }
      i += w;
    }
    j += h;
  }
  return tiles;
}
