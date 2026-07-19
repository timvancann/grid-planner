// Versioned plan schema: export/import JSON and migrations. All loads —
// autosave restore and file import alike — route through migrate() so old
// shapes keep working when the schema evolves.

import {
  DEFAULT_BED_CELLS,
  DEFAULT_PITCH,
  type BedSize,
  type Plan,
  type PlanImage,
  type Surface,
  type Tool,
} from "./types";

/** Stable IndexedDB key for the (single) background image blob. */
export const IMAGE_BLOB_KEY = "plan-image";

/** On-disk file shape: a Plan plus the image embedded as a dataURL so the
 * exported file is fully self-contained (IndexedDB is per-origin, per-device). */
export interface PlanFile extends Plan {
  imageData: string | null;
}

export interface ImportedPlan {
  plan: Plan;
  imageData: string | null; // dataURL, decoded to a Blob outside core
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function migrateImage(raw: unknown): PlanImage | null {
  if (raw === null || raw === undefined) return null;
  if (!isObj(raw)) throw new Error("invalid image");
  const { natW, natH, scale, x, y, rot, opacity } = raw;
  if (![natW, natH, scale, x, y, rot, opacity].every(isNum)) {
    throw new Error("invalid image geometry");
  }
  return {
    blobKey: IMAGE_BLOB_KEY,
    natW: natW as number,
    natH: natH as number,
    scale: scale as number,
    x: x as number,
    y: y as number,
    rot: rot as number,
    opacity: opacity as number,
    locked: raw.locked === true,
  };
}

function migrateSurfaces(raw: unknown): Surface[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("invalid surfaces");
  return raw.map((s, n) => {
    if (!isObj(s) || ![s.x, s.y, s.w, s.h].every(isNum)) {
      throw new Error(`invalid surface #${n}`);
    }
    return {
      id: isStr(s.id) ? s.id : `s${n}`,
      x: s.x as number,
      y: s.y as number,
      w: s.w as number,
      h: s.h as number,
    };
  });
}

function migrateTools(raw: unknown): Tool[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("invalid tools");
  return raw.map((t, n) => {
    if (!isObj(t) || ![t.x, t.y, t.w, t.h].every(isNum)) {
      throw new Error(`invalid tool #${n}`);
    }
    let snaps: Tool["snaps"];
    if (t.snaps !== undefined && t.snaps !== null) {
      if (
        !Array.isArray(t.snaps) ||
        !t.snaps.every((s) => isObj(s) && isNum(s.di) && isNum(s.dj))
      ) {
        throw new Error(`invalid snaps on tool #${n}`);
      }
      snaps = t.snaps.map((s) => ({
        di: Math.floor(s.di as number),
        dj: Math.floor(s.dj as number),
      }));
      if (snaps.length === 0) snaps = undefined;
    }
    return {
      id: isStr(t.id) ? t.id : `t${n}`,
      name: isStr(t.name) ? t.name : "Tool",
      x: t.x as number,
      y: t.y as number,
      w: t.w as number,
      h: t.h as number,
      color: isStr(t.color) ? t.color : "#53c2e8",
      ...(snaps ? { snaps } : {}),
    };
  });
}

// bed was added after v1 shipped; absent (older saves) means the default
function migrateBed(raw: unknown): BedSize {
  const fallback = { w: DEFAULT_BED_CELLS, h: DEFAULT_BED_CELLS };
  if (raw === undefined || raw === null) return fallback;
  if (!isObj(raw) || !isNum(raw.w) || !isNum(raw.h)) throw new Error("invalid bed size");
  return {
    w: Math.max(1, Math.floor(raw.w)),
    h: Math.max(1, Math.floor(raw.h)),
  };
}

function migrateActive(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every(isStr)) throw new Error("invalid active cells");
  return raw.filter((k) => /^-?\d+,-?\d+$/.test(k));
}

/**
 * Validate and upgrade a raw parsed value to the current Plan shape.
 * Accepts version 1 files and the version-less legacy prototype export
 * (which stored the image dataURL under image.href). Throws on garbage.
 */
export function migrate(raw: unknown): ImportedPlan {
  if (!isObj(raw)) throw new Error("plan is not an object");
  const version = raw.version ?? 1; // legacy prototype exports lack a version
  if (version !== 1) throw new Error(`unsupported plan version ${String(version)}`);

  const image = migrateImage(raw.image);
  const active = migrateActive(raw.active);
  const activeSet = new Set(active);
  let imageData: string | null = null;
  if (isStr(raw.imageData)) imageData = raw.imageData;
  else if (isObj(raw.image) && isStr(raw.image.href)) imageData = raw.image.href;

  return {
    plan: {
      version: 1,
      pitch: isNum(raw.pitch) && raw.pitch > 0 ? raw.pitch : DEFAULT_PITCH,
      bed: migrateBed(raw.bed),
      image,
      surfaces: migrateSurfaces(raw.surfaces),
      tools: migrateTools(raw.tools),
      active,
      // mounts must be printed cells; drop any that aren't active
      mounts: migrateActive(raw.mounts).filter((k) => activeSet.has(k)),
    },
    imageData,
  };
}

export function exportPlan(plan: Plan, imageData: string | null): string {
  const file: PlanFile = { ...plan, imageData: plan.image ? imageData : null };
  return JSON.stringify(file);
}

export function importPlan(json: string): ImportedPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("not valid JSON");
  }
  return migrate(raw);
}
