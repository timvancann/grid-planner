// Core model types. World space is millimetres; the grid origin is fixed at
// world (0,0). Nothing in src/core may import from Svelte.

export interface Point {
  x: number;
  y: number;
}

/** Visible world-space rectangle. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** screen = world * ppm + (ox, oy) */
export interface ViewState {
  ppm: number;
  ox: number;
  oy: number;
}

export interface PlanImage {
  blobKey: string; // reference into IndexedDB, NOT a dataURL
  natW: number;
  natH: number;
  scale: number; // mm per image pixel
  x: number; // world position of unrotated top-left, mm
  y: number;
  rot: number; // degrees, rotation about image center
  opacity: number;
  locked: boolean;
}

export interface Surface {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Multiconnect snap position: cell offset from the tool's first covered
 * cell (top-left of its footprint). */
export interface SnapOffset {
  di: number;
  dj: number;
}

export interface Tool {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** When set (non-empty), occupancy/conflicts come from these snap cells
   * only; otherwise the full footprint counts (default). */
  snaps?: SnapOffset[];
}

/** Max printable tile of the user's printer, in grid cells. */
export interface BedSize {
  w: number;
  h: number;
}

export interface Plan {
  version: 1; // schema version — bump + migrate, never break saves
  pitch: number;
  bed: BedSize;
  image: PlanImage | null;
  surfaces: Surface[];
  tools: Tool[];
  active: string[]; // serialized form of Set<cellKey>
  /** Cells used for mounting hardware (adhesive, screws). Always a subset of
   * active; occupied from the tools' perspective. */
  mounts: string[];
}

export const DEFAULT_PITCH = 28;
export const DEFAULT_BED_CELLS = 6;

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
