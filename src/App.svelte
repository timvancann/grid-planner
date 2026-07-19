<script lang="ts">
  import Canvas from "./components/Canvas.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import { history, redoNow, undoNow } from "./state/history.svelte";
  import { plan, ui } from "./state/plan.svelte";
  import { debounce, loadPersisted, savePlan } from "./state/persist";

  let sidebarOpen = $state(false);

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
  <div class="sidebar" class:open={sidebarOpen}>
    <Sidebar />
  </div>
  <div class="canvas-area">
    <Toolbar />
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
    width: 250px;
    flex-shrink: 0;
    background: var(--panel);
    border-right: 1px solid var(--panel-border);
    overflow-y: auto;
  }

  .canvas-area {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .sidebar-toggle {
    display: none;
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 6;
  }

  @media (max-width: 700px) {
    .sidebar {
      position: absolute;
      z-index: 10;
      height: 100%;
      left: -260px;
      transition: left 0.15s ease;
    }
    .sidebar.open {
      left: 0;
    }
    .sidebar-toggle {
      display: block;
    }
  }
</style>
