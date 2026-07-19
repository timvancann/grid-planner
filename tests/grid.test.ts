import { describe, expect, it } from "vitest";
import { cellAt, cellKey, cellKeyAt, gridLines, parseCellKey } from "../src/core/grid";

describe("cell keys", () => {
  it("floors negative coordinates into the correct cell", () => {
    expect(cellAt(-0.5, -0.5, 28)).toEqual({ i: -1, j: -1 });
    expect(cellAt(-28, -56, 28)).toEqual({ i: -1, j: -2 });
    expect(cellKeyAt(-1, 1, 28)).toBe("-1,0");
  });

  it("round-trips encode/decode", () => {
    expect(parseCellKey(cellKey(-12, 34))).toEqual({ i: -12, j: 34 });
  });
});

describe("gridLines", () => {
  const bounds = { x0: 0, y0: 0, x1: 280, y1: 280 };

  it("renders every line when zoomed in", () => {
    const g = gridLines(bounds, 28, 1); // 28 px per cell
    expect(g.step).toBe(1);
    expect(g.v).toContain(0);
    expect(g.v).toContain(280);
    expect(g.v).toHaveLength(11);
  });

  it("decimates to every 5th line below 6 px per cell", () => {
    const g = gridLines(bounds, 28, 0.2); // 5.6 px per cell
    expect(g.step).toBe(5);
    expect(g.v.every((x) => x % (28 * 5) === 0)).toBe(true);
  });

  it("renders nothing beyond the per-axis line cap", () => {
    const huge = { x0: 0, y0: 0, x1: 1e7, y1: 1e7 };
    const g = gridLines(huge, 28, 0.05);
    expect(g.v).toHaveLength(0);
    expect(g.h).toHaveLength(0);
  });
});
