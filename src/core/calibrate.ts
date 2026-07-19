// Two-point scale calibration.
//
// The user clicks world points a and b and enters the real distance D (mm).
// Let d = |b - a| at the current scale s, ratio r = D / d, new scale s' = s*r.
//
// We anchor the FIRST clicked point a so it stays fixed in world space. The
// image rotates about its center C, so a point p on the image sits at
//   p_world = C + R(theta) * (p_img * s - halfSize)
// Scaling s by r scales the offset (p_world - C) by r for every image point,
// regardless of theta, because R(theta) is linear and distances are
// rotation-invariant. To keep a fixed we therefore need a new center C' with
//   a - C' = r * (a - C)   =>   C' = a - r * (a - C)
// and the unrotated top-left follows from the center:
//   x' = C'.x - natW * s' / 2,  y' = C'.y - natH * s' / 2.
// This is exact for any rotation angle.

import type { PlanImage, Point } from "./types";

/**
 * Returns the recalibrated image, or null when the input is degenerate
 * (coincident points or non-positive real distance).
 */
export function calibrateImage(
  image: PlanImage,
  a: Point,
  b: Point,
  realDistMm: number,
): PlanImage | null {
  if (!(realDistMm > 0)) return null;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 1e-6) return null;
  const r = realDistMm / d;
  const s2 = image.scale * r;
  const C = {
    x: image.x + (image.natW * image.scale) / 2,
    y: image.y + (image.natH * image.scale) / 2,
  };
  const C2 = { x: a.x - r * (a.x - C.x), y: a.y - r * (a.y - C.y) };
  return {
    ...image,
    scale: s2,
    x: C2.x - (image.natW * s2) / 2,
    y: C2.y - (image.natH * s2) / 2,
  };
}

/** Center of the image in world space (rotation pivot). */
export function imageCenter(image: PlanImage): Point {
  return {
    x: image.x + (image.natW * image.scale) / 2,
    y: image.y + (image.natH * image.scale) / 2,
  };
}

/** World position of an image-pixel coordinate, honoring rotation. */
export function imagePointToWorld(image: PlanImage, px: number, py: number): Point {
  const C = imageCenter(image);
  const t = (image.rot * Math.PI) / 180;
  const dx = px * image.scale - (image.natW * image.scale) / 2;
  const dy = py * image.scale - (image.natH * image.scale) / 2;
  return {
    x: C.x + dx * Math.cos(t) - dy * Math.sin(t),
    y: C.y + dx * Math.sin(t) + dy * Math.cos(t),
  };
}
