// Snapshot-based undo/redo over the whole Plan. Changes stream in from the
// autosave effect and are coalesced by a short debounce; pointer strokes
// (paint drags, object moves) are bracketed explicitly so each one is a
// single undo step regardless of duration.

import type { Plan } from "../core/types";
import { plan, ui } from "./plan.svelte";
import { getImageBlob } from "./persist";

const LIMIT = 100;
const COALESCE_MS = 400;

class HistoryStore {
  #undo: Plan[] = [];
  #redo: Plan[] = [];
  #current: Plan | null = null; // last committed state
  #timer: ReturnType<typeof setTimeout> | undefined;
  #stroking = false;

  canUndo = $state(false);
  canRedo = $state(false);

  #sync() {
    this.canUndo = this.#undo.length > 0;
    this.canRedo = this.#redo.length > 0;
  }

  #commit(snap: Plan) {
    if (this.#current === null) {
      this.#current = snap; // initial load: baseline, not an undo step
      return;
    }
    if (JSON.stringify(this.#current) === JSON.stringify(snap)) return;
    this.#undo.push(this.#current);
    if (this.#undo.length > LIMIT) this.#undo.shift();
    this.#current = snap;
    this.#redo = [];
    this.#sync();
  }

  /** Feed every settled plan snapshot here (the autosave effect does). */
  onChange(snap: Plan) {
    if (this.#stroking) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#commit(snap), COALESCE_MS);
  }

  /** Bracket a pointer stroke: commit anything pending, then freeze until end. */
  beginStroke(preState: Plan) {
    clearTimeout(this.#timer);
    this.#commit(preState);
    this.#stroking = true;
  }

  endStroke(postState: Plan) {
    this.#stroking = false;
    this.#commit(postState);
  }

  undo(): Plan | null {
    clearTimeout(this.#timer);
    const prev = this.#undo.pop();
    if (!prev || !this.#current) return null;
    this.#redo.push(this.#current);
    this.#current = prev;
    this.#sync();
    return prev;
  }

  redo(): Plan | null {
    clearTimeout(this.#timer);
    const next = this.#redo.pop();
    if (!next || !this.#current) return null;
    this.#undo.push(this.#current);
    this.#current = next;
    this.#sync();
    return next;
  }
}

export const history = new HistoryStore();

async function applySnapshot(s: Plan) {
  // clone: stored snapshots must never become live reactive state, or later
  // in-place mutations (push into tools) would corrupt the history
  plan.load(structuredClone(s));
  ui.calib = null;
  ui.editSnapsToolId = null;
  if (plan.image) {
    if (!ui.imageUrl) {
      const blob = await getImageBlob();
      if (blob) ui.setImageUrl(URL.createObjectURL(blob));
    }
  } else {
    ui.setImageUrl(null);
    if (ui.mode === "calibrate") ui.mode = "move";
  }
}

export async function undoNow() {
  const s = history.undo();
  if (s) await applySnapshot(s);
}

export async function redoNow() {
  const s = history.redo();
  if (s) await applySnapshot(s);
}
