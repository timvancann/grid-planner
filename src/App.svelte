<script lang="ts">
  import Canvas from "./components/Canvas.svelte";
  import PlanActions from "./components/PlanActions.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { clamp } from "./core/types";
  import { history, redoNow, undoNow } from "./state/history.svelte";
  import { plan, ui } from "./state/plan.svelte";
  import { debounce, loadPersisted, savePlan } from "./state/persist";

  let sidebarOpen = $state(false);
  let sidebarW = $state(
    clamp(parseInt(localStorage.getItem("gp:sidebarW") ?? "250") || 250, 200, 480),
  );

  function startSidebarResize(e: PointerEvent) {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // best-effort: resizing still works while the pointer stays on the handle
    }
    const onMove = (ev: PointerEvent) => {
      sidebarW = clamp(ev.clientX, 200, 480);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      localStorage.setItem("gp:sidebarW", String(sidebarW));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  const save = debounce(savePlan, 500);

  $effect(() => {
    loadPersisted().then(({ plan: saved, imageBlob }) => {
      if (saved) {
        plan.load(saved);
        if (imageBlob) ui.setImageUrl(URL.createObjectURL(imageBlob));
      }
      ui.loaded = true;
    });
  });

  // Debounced autosave: toPlan() reads every reactive field, so any plan
  // mutation re-runs this effect. Runs only after the initial restore.
  $effect(() => {
    const snapshot = plan.toPlan();
    if (!ui.loaded) return;
    save(snapshot);
    history.onChange(snapshot);
  });

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        void (e.shiftKey ? redoNow() : undoNow());
      } else if (k === "y") {
        e.preventDefault();
        void redoNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<div class="app">
  <div class="sidebar" class:open={sidebarOpen} style:width="{sidebarW}px">
    <Sidebar />
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resize-handle" onpointerdown={startSidebarResize}></div>
  <div class="canvas-area">
    <Toolbar />
    <div class="plan-actions">
      <PlanActions />
    </div>
    <button
      class="btn sidebar-toggle"
      onclick={() => (sidebarOpen = !sidebarOpen)}
    >
      {sidebarOpen ? "close" : "panels"}
    </button>
    <Canvas />
  </div>
</div>

<style>
  .app {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .sidebar {
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--panel-border);
    overflow-y: auto;
  }

  .resize-handle {
    flex-shrink: 0;
    width: 5px;
    margin-left: -3px;
    cursor: col-resize;
    z-index: 6;
    touch-action: none;
  }

  .resize-handle:hover {
    background: var(--surface-stroke);
  }

  .canvas-area {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .plan-actions {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 5;
  }

  .sidebar-toggle {
    display: none;
    position: absolute;
    top: 46px;
    right: 10px;
    z-index: 6;
  }

  @media (max-width: 700px) {
    .sidebar {
      position: absolute;
      z-index: 10;
      height: 100%;
      left: -490px;
      transition: left 0.15s ease;
    }
    .sidebar.open {
      left: 0;
    }
    .resize-handle {
      display: none;
    }
    .sidebar-toggle {
      display: block;
    }
  }
</style>
