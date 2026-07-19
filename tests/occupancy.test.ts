import { describe, expect, it } from "vitest";
import {
  allOccupancy,
  occupiedCellCount,
  toolOccupancy,
  toolOverlaps,
} from "../src/core/occupancy";
import type { Tool } from "../src/core/types";

const PITCH = 28;
const tool = (x: number, y: number, w: number, h: number): Tool => ({
  id: "t1",
  name: "T",
  x,
  y,
  w,
  h,
  color: "#fff",
});

describe("toolOccupancy", () => {
  it("exact-fit snapped tool covers exactly n cells per axis", () => {
    // 3x2 pitches, snapped to origin
    const o = toolOccupancy(tool(0, 0, 3 * PITCH, 2 * PITCH), PITCH, new Set());
    expect(o.cells).toHaveLength(6);
    const is = o.cells.map((c) => c.i);
    const js = o.cells.map((c) => c.j);
    expect(Math.min(...is)).toBe(0);
    expect(Math.max(...is)).toBe(2);
    expect(Math.min(...js)).toBe(0);
    expect(Math.max(...js)).toBe(1);
  });

  it("edge-touching neighbor cell excluded by epsilon", () => {
    // tool ends exactly on the boundary at x = 2*pitch: cell i=2 not covered
    const o = toolOccupancy(tool(PITCH, 0, PITCH, PITCH), PITCH, new Set());
    expect(o.cells).toHaveLength(1);
    expect(o.cells[0]).toMatchObject({ i: 1, j: 0 });
  });

  it("handles negative coordinates", () => {
    const o = toolOccupancy(tool(-2 * PITCH, -PITCH, 2 * PITCH, PITCH), PITCH, new Set());
    expect(o.cells.map(({ i, j }) => `${i},${j}`).sort()).toEqual(["-1,-1", "-2,-1"]);
  });

  it("sets the conflict flag only when a covered cell is inactive", () => {
    const t = tool(0, 0, 2 * PITCH, PITCH);
    const allActive = new Set(["0,0", "1,0"]);
    expect(toolOccupancy(t, PITCH, allActive).conflict).toBe(false);
    const partial = new Set(["0,0"]);
    const o = toolOccupancy(t, PITCH, partial);
    expect(o.conflict).toBe(true);
    expect(o.cells.find((c) => c.i === 1)!.ok).toBe(false);
  });

  it("uses snap cells instead of the footprint when snaps are set", () => {
    // 3x2 footprint at origin, snaps only at corners (0,0) and (2,1)
    const t = { ...tool(0, 0, 3 * PITCH, 2 * PITCH), snaps: [{ di: 0, dj: 0 }, { di: 2, dj: 1 }] };
    const o = toolOccupancy(t, PITCH, new Set(["0,0", "2,1"]));
    expect(o.cells).toHaveLength(2);
    expect(o.conflict).toBe(false); // footprint cells like 1,0 may be inactive
    const o2 = toolOccupancy(t, PITCH, new Set(["0,0"]));
    expect(o2.conflict).toBe(true); // a snap cell is inactive
  });

  it("treats an empty snaps array as the default full footprint", () => {
    const t = { ...tool(0, 0, PITCH, PITCH), snaps: [] };
    const o = toolOccupancy(t, PITCH, new Set());
    expect(o.cells).toHaveLength(1);
  });

  it("treats mount cells as occupied", () => {
    const t = tool(0, 0, 2 * PITCH, PITCH);
    const active = new Set(["0,0", "1,0"]);
    expect(toolOccupancy(t, PITCH, active).conflict).toBe(false);
    const o = toolOccupancy(t, PITCH, active, new Set(["1,0"]));
    expect(o.conflict).toBe(true);
    expect(o.cells.find((c) => c.i === 1)!.ok).toBe(false);
    // snap tools too: a snap landing on a mount cell conflicts
    const s = { ...t, snaps: [{ di: 1, dj: 0 }] };
    expect(toolOccupancy(s, PITCH, active, new Set(["1,0"])).conflict).toBe(true);
    expect(toolOccupancy(s, PITCH, active, new Set(["0,0"])).conflict).toBe(false);
  });

  it("reports the intersection rect of overlapping tool bodies", () => {
    const a = { ...tool(0, 0, 84, 56), id: "a" };
    const b = { ...tool(56, 28, 84, 56), id: "b" };
    const ov = toolOverlaps([a, b]);
    expect(ov).toEqual([{ aId: "a", bId: "b", x: 56, y: 28, w: 28, h: 28 }]);
  });

  it("does not count edge-touching or disjoint tools as overlapping", () => {
    const a = { ...tool(0, 0, 84, 56), id: "a" };
    const touching = { ...tool(84, 0, 84, 56), id: "b" };
    const disjoint = { ...tool(300, 300, 28, 28), id: "c" };
    expect(toolOverlaps([a, touching, disjoint])).toEqual([]);
  });

  it("counts distinct occupied cells across overlapping tools", () => {
    const active = new Set(["0,0", "1,0"]);
    const occ = allOccupancy(
      [tool(0, 0, 2 * PITCH, PITCH), { ...tool(0, 0, PITCH, PITCH), id: "t2" }],
      PITCH,
      active,
    );
    expect(occupiedCellCount(occ)).toBe(2); // cell 0,0 counted once
  });
});
