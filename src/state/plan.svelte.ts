// Reactive stores (Svelte 5 runes) wrapping the framework-free core types.
// Components read/write these; all geometry math stays in src/core.

import { SvelteSet } from "svelte/reactivity";
import type { BedSize, Plan, PlanImage, Point, Surface, Tool, ViewState } from "../core/types";
import { DEFAULT_BED_CELLS, DEFAULT_PITCH } from "../core/types";
import { IMAGE_BLOB_KEY } from "../core/serialize";

export const TOOL_COLORS = ["#53c2e8", "#8ab4f8", "#6fd08c", "#c792ea", "#f78c6c"];

const uid = () => Math.random().toString(36).slice(2, 9);

class PlanStore {
  pitch = $state(DEFAULT_PITCH);
  bed = $state<BedSize>({ w: DEFAULT_BED_CELLS, h: DEFAULT_BED_CELLS });
  image = $state<PlanImage | null>(null);
  surfaces = $state<Surface[]>([]);
  tools = $state<Tool[]>([]);
  active = new SvelteSet<string>();
  mounts = new SvelteSet<string>();

  toPlan(): Plan {
    // $state.snapshot strips reactivity proxies deeply — shallow spreads would
    // leave nested arrays (tool.snaps) as proxies, which IndexedDB's
    // structured clone rejects
    return {
      version: 1,
      pitch: this.pitch,
      bed: $state.snapshot(this.bed),
      image: this.image ? $state.snapshot(this.image) : null,
      surfaces: $state.snapshot(this.surfaces),
      tools: $state.snapshot(this.tools),
      active: [...this.active],
      mounts: [...this.mounts],
    };
  }

  load(p: Plan) {
    this.pitch = p.pitch;
    this.bed = p.bed;
    this.image = p.image;
    this.surfaces = p.surfaces;
    this.tools = p.tools;
    this.active.clear();
    for (const k of p.active) this.active.add(k);
    this.mounts.clear();
    for (const k of p.mounts) this.mounts.add(k);
  }

  reset() {
    this.load({
      version: 1,
      pitch: DEFAULT_PITCH,
      bed: { w: DEFAULT_BED_CELLS, h: DEFAULT_BED_CELLS },
      image: null,
      surfaces: [],
      tools: [],
      active: [],
      mounts: [],
    });
  }

  addSurface(w: number, h: number, x: number, y: number) {
    this.surfaces.push({ id: uid(), x, y, w, h });
  }

  addTool(name: string, w: number, h: number, x: number, y: number) {
    this.tools.push({
      id: uid(),
      name: name || "Tool",
      x,
      y,
      w,
      h,
      color: TOOL_COLORS[this.tools.length % TOOL_COLORS.length]!,
    });
  }

  setImageFromUpload(natW: number, natH: number) {
    this.image = {
      blobKey: IMAGE_BLOB_KEY,
      natW,
      natH,
      scale: 1000 / natW, // initial guess: image ~1000 mm wide
      x: 0,
      y: 0,
      rot: 0,
      opacity: 0.85,
      locked: false,
    };
  }
}

export type Mode = "move" | "paint" | "mount" | "calibrate";

export interface CalibrationDraft {
  a: Point | null;
  b: Point | null;
  dist: string; // raw input field value
}

class UiStore {
  view = $state<ViewState>({ ppm: 1.4, ox: 120, oy: 100 });
  mode = $state<Mode>("move");
  snap = $state(true);
  calib = $state<CalibrationDraft | null>(null);
  imageUrl = $state<string | null>(null); // object URL of the current image blob
  loaded = $state(false); // persisted state restored
  canvasSize = $state({ w: 800, h: 600 }); // px, kept current by Canvas
  objectDim = $state(0.35); // fraction of cell-dim applied to surfaces/image
  editSnapsToolId = $state<string | null>(null); // tool whose snaps are being edited

  setImageUrl(url: string | null) {
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = url;
  }
}

export const plan = new PlanStore();
export const ui = new UiStore();
