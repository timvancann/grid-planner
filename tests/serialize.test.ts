import { describe, expect, it } from "vitest";
import { exportPlan, importPlan, migrate } from "../src/core/serialize";
import type { Plan } from "../src/core/types";

const samplePlan: Plan = {
  version: 1,
  pitch: 28,
  bed: { w: 6, h: 6 },
  image: {
    blobKey: "plan-image",
    natW: 1200,
    natH: 900,
    scale: 0.9,
    x: 10,
    y: 20,
    rot: 15,
    opacity: 0.8,
    locked: true,
  },
  surfaces: [{ id: "s1", x: 0, y: 0, w: 600, h: 400 }],
  tools: [
    { id: "t1", name: "Pliers", x: 28, y: 28, w: 84, h: 56, color: "#53c2e8" },
    {
      id: "t2",
      name: "Saw",
      x: 0,
      y: 0,
      w: 84,
      h: 28,
      color: "#8ab4f8",
      snaps: [{ di: 0, dj: 0 }, { di: 2, dj: 0 }],
    },
  ],
  active: ["0,0", "1,0", "-3,2"],
  mounts: ["1,0"],
};

describe("serialize", () => {
  it("round-trips export -> import", () => {
    const json = exportPlan(samplePlan, "data:image/jpeg;base64,abc123");
    const { plan, imageData } = importPlan(json);
    expect(plan).toEqual(samplePlan);
    expect(imageData).toBe("data:image/jpeg;base64,abc123");
  });

  it("drops imageData when the plan has no image", () => {
    const json = exportPlan({ ...samplePlan, image: null }, "data:whatever");
    const { plan, imageData } = importPlan(json);
    expect(plan.image).toBeNull();
    expect(imageData).toBeNull();
  });

  it("accepts the legacy version-less prototype export", () => {
    const legacy = JSON.stringify({
      pitch: 28,
      image: {
        href: "data:image/png;base64,xyz",
        natW: 640,
        natH: 480,
        scale: 1.5625,
        x: 0,
        y: 0,
        rot: 0,
        opacity: 0.85,
        locked: false,
      },
      surfaces: [{ id: "a", x: 0, y: 0, w: 100, h: 100 }],
      tools: [],
      active: ["2,3"],
    });
    const { plan, imageData } = importPlan(legacy);
    expect(plan.version).toBe(1);
    expect(plan.image?.natW).toBe(640);
    expect(plan.image?.blobKey).toBe("plan-image");
    expect(imageData).toBe("data:image/png;base64,xyz");
  });

  it("rejects garbage gracefully", () => {
    expect(() => importPlan("not json")).toThrow();
    expect(() => migrate(42)).toThrow();
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({ version: 99 })).toThrow();
    expect(() => migrate({ version: 1, tools: "nope" })).toThrow();
    expect(() => migrate({ version: 1, image: { natW: "wide" } })).toThrow();
    expect(() =>
      migrate({
        version: 1,
        tools: [{ x: 0, y: 0, w: 1, h: 1, snaps: [{ di: "a" }] }],
      }),
    ).toThrow();
  });

  it("drops mounts on inactive cells and defaults to none", () => {
    const { plan } = migrate({ version: 1, active: ["0,0"], mounts: ["0,0", "5,5"] });
    expect(plan.mounts).toEqual(["0,0"]); // 5,5 is not printed
    expect(migrate({ version: 1 }).plan.mounts).toEqual([]);
  });

  it("defaults the bed size when absent (pre-bed saves) and validates it", () => {
    const { plan } = migrate({ version: 1 });
    expect(plan.bed).toEqual({ w: 6, h: 6 });
    const { plan: p2 } = migrate({ version: 1, bed: { w: 9.7, h: 4 } });
    expect(p2.bed).toEqual({ w: 9, h: 4 });
    expect(() => migrate({ version: 1, bed: { w: "wide" } })).toThrow();
  });

  it("filters malformed cell keys instead of failing the whole plan", () => {
    const { plan } = migrate({ version: 1, active: ["1,2", "bogus", "-4,-5"] });
    expect(plan.active).toEqual(["1,2", "-4,-5"]);
  });
});
