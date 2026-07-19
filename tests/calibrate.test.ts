import { describe, expect, it } from "vitest";
import { calibrateImage, imagePointToWorld } from "../src/core/calibrate";
import type { PlanImage } from "../src/core/types";

const baseImage = (rot = 0): PlanImage => ({
  blobKey: "plan-image",
  natW: 800,
  natH: 600,
  scale: 1.25,
  x: 40,
  y: -30,
  rot,
  opacity: 0.85,
  locked: false,
});

describe("calibrateImage", () => {
  it("applies the scale ratio exactly", () => {
    const img = baseImage();
    const a = { x: 100, y: 100 };
    const b = { x: 300, y: 100 }; // current distance 200 mm
    const out = calibrateImage(img, a, b, 500);
    expect(out).not.toBeNull();
    expect(out!.scale).toBeCloseTo(img.scale * 2.5, 10);
  });

  it("keeps point A fixed in world space at theta = 0", () => {
    const img = baseImage(0);
    const a = { x: 120, y: 80 };
    const b = { x: 420, y: 310 };
    const out = calibrateImage(img, a, b, 777)!;
    // A is an image point; find its image-pixel coords, then map through the
    // calibrated image — it must land on the same world position.
    const pxA = { x: (a.x - img.x) / img.scale, y: (a.y - img.y) / img.scale };
    const aAfter = imagePointToWorld(out, pxA.x, pxA.y);
    expect(aAfter.x).toBeCloseTo(a.x, 9);
    expect(aAfter.y).toBeCloseTo(a.y, 9);
  });

  it("keeps point A fixed in world space at theta = 37 deg", () => {
    const img = baseImage(37);
    // pick A as the world position of a known image pixel
    const pxA = { x: 613, y: 217 };
    const a = imagePointToWorld(img, pxA.x, pxA.y);
    const b = { x: a.x + 260, y: a.y - 140 };
    const out = calibrateImage(img, a, b, 1234)!;
    const aAfter = imagePointToWorld(out, pxA.x, pxA.y);
    expect(aAfter.x).toBeCloseTo(a.x, 9);
    expect(aAfter.y).toBeCloseTo(a.y, 9);
  });

  it("composes with rotation in either order", () => {
    // calibrate then rotate vs rotate then calibrate: scale must agree, and
    // the image center distance from anchor A must scale identically.
    const a = { x: 150, y: 90 };
    const b = { x: 350, y: 290 };
    const D = 640;

    const calibratedFirst = calibrateImage(baseImage(0), a, b, D)!;
    const thenRotated = { ...calibratedFirst, rot: 25 };

    const rotatedFirst = { ...baseImage(0), rot: 25 };
    const thenCalibrated = calibrateImage(rotatedFirst, a, b, D)!;

    expect(thenRotated.scale).toBeCloseTo(thenCalibrated.scale, 10);
    expect(thenRotated.x).toBeCloseTo(thenCalibrated.x, 9);
    expect(thenRotated.y).toBeCloseTo(thenCalibrated.y, 9);
  });

  it("rejects degenerate input", () => {
    const img = baseImage();
    const p = { x: 10, y: 10 };
    expect(calibrateImage(img, p, p, 100)).toBeNull();
    expect(calibrateImage(img, p, { x: 20, y: 10 }, 0)).toBeNull();
    expect(calibrateImage(img, p, { x: 20, y: 10 }, NaN)).toBeNull();
  });
});
