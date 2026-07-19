import { describe, expect, it } from "vitest";
import { balancedParts, segmentActive } from "../src/core/segment";

const rect = (i0: number, j0: number, w: number, h: number): Set<string> => {
  const s = new Set<string>();
  for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) s.add(`${i},${j}`);
  return s;
};

describe("balancedParts", () => {
  it("splits evenly instead of greedily", () => {
    expect(balancedParts(7, 6)).toEqual([4, 3]); // not [6, 1]
    expect(balancedParts(12, 6)).toEqual([6, 6]);
    expect(balancedParts(13, 6)).toEqual([5, 4, 4]);
    expect(balancedParts(6, 6)).toEqual([6]);
    expect(balancedParts(1, 6)).toEqual([1]);
  });

  it("never exceeds the max", () => {
    for (let total = 1; total <= 40; total++) {
      for (let max = 1; max <= 9; max++) {
        const parts = balancedParts(total, max);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts)).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("segmentActive", () => {
  const bed = { w: 6, h: 6 };

  it("returns nothing for an empty set", () => {
    expect(segmentActive(new Set(), bed)).toEqual([]);
  });

  it("keeps a fitting rectangle as a single tile", () => {
    expect(segmentActive(rect(-2, 1, 5, 3), bed)).toEqual([{ i0: -2, j0: 1, w: 5, h: 3 }]);
  });

  it("splits a 7-wide rectangle into balanced 4+3", () => {
    const tiles = segmentActive(rect(0, 0, 7, 3), bed);
    expect(tiles.map((t) => t.w).sort()).toEqual([3, 4]);
    expect(tiles.every((t) => t.w <= 6 && t.h <= 6)).toBe(true);
  });

  it("drops empty tiles and trims to painted content (L-shape)", () => {
    // L: 8x2 horizontal bar + 2x6 vertical leg — the top-right cut region of
    // the bbox contains no painted cells and must not produce a tile
    const active = new Set([...rect(0, 4, 8, 2), ...rect(0, 0, 2, 6)]);
    const tiles = segmentActive(active, bed);
    expect(tiles.length).toBe(2);
    for (const t of tiles) {
      expect(t.w).toBeLessThanOrEqual(6);
      expect(t.h).toBeLessThanOrEqual(6);
    }
    // every painted cell is covered by some tile
    for (const key of active) {
      const [i, j] = key.split(",").map(Number);
      expect(
        tiles.some((t) => i! >= t.i0 && i! < t.i0 + t.w && j! >= t.j0 && j! < t.j0 + t.h),
      ).toBe(true);
    }
  });
});
