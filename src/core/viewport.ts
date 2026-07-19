// World <-> screen transforms and zoom math. Pan/zoom only ever mutates the
// view, never geometry.

import { clamp, type Bounds, type Point, type ViewState } from "./types";

export const PPM_MIN = 0.05;
export const PPM_MAX = 30;

export function toWorld(v: ViewState, sx: number, sy: number): Point {
  return { x: (sx - v.ox) / v.ppm, y: (sy - v.oy) / v.ppm };
}

export function toScreen(v: ViewState, wx: number, wy: number): Point {
  return { x: wx * v.ppm + v.ox, y: wy * v.ppm + v.oy };
}

/**
 * Scale ppm by `factor` keeping the world point under screen (sx, sy) fixed:
 * w = (s - o) / ppm must be invariant, so o' = s - w * ppm'.
 */
export function zoomAt(v: ViewState, sx: number, sy: number, factor: number): ViewState {
  const ppm = clamp(v.ppm * factor, PPM_MIN, PPM_MAX);
  const wx = (sx - v.ox) / v.ppm;
  const wy = (sy - v.oy) / v.ppm;
  return { ppm, ox: sx - wx * ppm, oy: sy - wy * ppm };
}

export function panBy(v: ViewState, dx: number, dy: number): ViewState {
  return { ppm: v.ppm, ox: v.ox + dx, oy: v.oy + dy };
}

/** World-space rectangle currently visible in a (w x h) px viewport. */
export function visibleBounds(v: ViewState, w: number, h: number): Bounds {
  return {
    x0: -v.ox / v.ppm,
    y0: -v.oy / v.ppm,
    x1: (w - v.ox) / v.ppm,
    y1: (h - v.oy) / v.ppm,
  };
}

/** View that fits world bounds `b` into a (w x h) px viewport with margin. */
export function fitBounds(b: Bounds, w: number, h: number, marginPx = 40): ViewState {
  const bw = Math.max(b.x1 - b.x0, 1e-6);
  const bh = Math.max(b.y1 - b.y0, 1e-6);
  const ppm = clamp(
    Math.min((w - 2 * marginPx) / bw, (h - 2 * marginPx) / bh),
    PPM_MIN,
    PPM_MAX,
  );
  return {
    ppm,
    ox: (w - bw * ppm) / 2 - b.x0 * ppm,
    oy: (h - bh * ppm) / 2 - b.y0 * ppm,
  };
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}
