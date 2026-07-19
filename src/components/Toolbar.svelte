<script lang="ts">
  import { imagePointToWorld } from "../core/calibrate";
  import { activeWorldBounds } from "../core/paint";
  import type { Bounds } from "../core/types";
  import { fitBounds, unionBounds, zoomAt } from "../core/viewport";
  import { history, redoNow, undoNow } from "../state/history.svelte";
  import { plan, ui } from "../state/plan.svelte";

  function zoomBy(factor: number) {
    const { w, h } = ui.canvasSize;
    ui.view = zoomAt(ui.view, w / 2, h / 2, factor);
  }

  // fit = bounding box of surfaces, active cells, and image (rotated corners)
  function fitToContent() {
    let b: Bounds | null = null;
    for (const s of plan.surfaces) {
      b = unionBounds(b, { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h });
    }
    b = unionBounds(b, activeWorldBounds(plan.active, plan.pitch));
    if (plan.image) {
      const im = plan.image;
      for (const [cx, cy] of [
        [0, 0],
        [im.natW, 0],
        [0, im.natH],
        [im.natW, im.natH],
      ] as const) {
        const p = imagePointToWorld(im, cx, cy);
        b = unionBounds(b, { x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }
    }
    if (!b) return;
    ui.view = fitBounds(b, ui.canvasSize.w, ui.canvasSize.h);
  }
</script>

<div class="toolbar">
  <button
    class="btn"
    class:active={ui.mode === "move"}
    onclick={() => (ui.mode = "move")}
  >
    Move
  </button>
  <button
    class="btn"
    class:active={ui.mode === "paint"}
    onclick={() => (ui.mode = "paint")}
  >
    Paint cells
  </button>
  <button
    class="btn"
    class:active={ui.mode === "mount"}
    title="mark cells taken by mounting hardware (adhesive, screws)"
    onclick={() => (ui.mode = "mount")}
  >
    Mounts
  </button>
  <span class="sep"></span>
  <button
    class="btn"
    disabled={!history.canUndo}
    title="undo (⌘Z)"
    onclick={() => void undoNow()}
  >
    ↺
  </button>
  <button
    class="btn"
    disabled={!history.canRedo}
    title="redo (⇧⌘Z)"
    onclick={() => void redoNow()}
  >
    ↻
  </button>
  <span class="sep"></span>
  <button class="btn" onclick={() => zoomBy(1.25)}>+</button>
  <button class="btn" onclick={() => zoomBy(0.8)}>−</button>
  <button class="btn" onclick={fitToContent}>fit</button>
</div>

<style>
  .toolbar {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 5;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .sep {
    width: 1px;
    height: 18px;
    background: var(--panel-border);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
