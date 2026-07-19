// IndexedDB persistence via idb-keyval. The plan JSON and the image blob are
// stored under separate keys; Plan.image.blobKey references the blob.

import { del, get, set } from "idb-keyval";
import type { Plan } from "../core/types";
import { IMAGE_BLOB_KEY, migrate } from "../core/serialize";

const PLAN_KEY = "opengrid:plan";
const BLOB_KEY = `opengrid:blob:${IMAGE_BLOB_KEY}`;

export async function savePlan(p: Plan): Promise<void> {
  await set(PLAN_KEY, p);
}

export async function saveImageBlob(blob: Blob): Promise<void> {
  await set(BLOB_KEY, blob);
}

export async function deleteImageBlob(): Promise<void> {
  await del(BLOB_KEY);
}

export async function getImageBlob(): Promise<Blob | null> {
  const b = await get(BLOB_KEY);
  return b instanceof Blob ? b : null;
}

export interface PersistedState {
  plan: Plan | null;
  imageBlob: Blob | null;
}

/** Load persisted state; malformed saves are discarded rather than fatal. */
export async function loadPersisted(): Promise<PersistedState> {
  try {
    const raw = await get(PLAN_KEY);
    if (raw === undefined) return { plan: null, imageBlob: null };
    const { plan } = migrate(raw);
    const imageBlob = plan.image ? ((await get(BLOB_KEY)) ?? null) : null;
    return { plan, imageBlob: imageBlob instanceof Blob ? imageBlob : null };
  } catch (e) {
    console.warn("discarding unreadable saved plan:", e);
    return { plan: null, imageBlob: null };
  }
}

export async function clearPersisted(): Promise<void> {
  await del(PLAN_KEY);
  await del(BLOB_KEY);
}

/** Debounce helper for autosave. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
