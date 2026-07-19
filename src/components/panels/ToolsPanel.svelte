<script lang="ts">
  import { visibleBounds } from "../../core/viewport";
  import { plan, ui } from "../../state/plan.svelte";
  import Section from "./Section.svelte";

  let name = $state("Tool");
  let w = $state(84);
  let h = $state(56);

  let editingId = $state<string | null>(null);
  let editName = $state("");

  function add() {
    if (!(w > 0 && h > 0)) return;
    const vb = visibleBounds(ui.view, ui.canvasSize.w, ui.canvasSize.h);
    let x = (vb.x0 + vb.x1) / 2 - w / 2;
    let y = (vb.y0 + vb.y1) / 2 - h / 2;
    if (ui.snap) {
      x = Math.round(x / plan.pitch) * plan.pitch;
      y = Math.round(y / plan.pitch) * plan.pitch;
    }
    plan.addTool(name, w, h, x, y);
  }

  function startRename(id: string, current: string) {
    editingId = id;
    editName = current;
  }

  function commitRename() {
    const id = editingId;
    if (id !== null) {
      const next = editName.trim();
      if (next) plan.tools = plan.tools.map((t) => (t.id === id ? { ...t, name: next } : t));
    }
    editingId = null;
  }
</script>

<Section title="Tools">
  <input class="input name" type="text" placeholder="name" bind:value={name} />
  <div class="adder">
    <input class="input" type="number" title="width (mm)" bind:value={w} />
    <span class="x">×</span>
    <input class="input" type="number" title="height (mm)" bind:value={h} />
    <span class="unit">mm</span>
    <button class="btn" onclick={add}>Add</button>
  </div>
  {#each plan.tools as t (t.id)}
    <div class="item">
      {#if editingId === t.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="input"
          type="text"
          autofocus
          bind:value={editName}
          onblur={commitRename}
          onkeydown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") editingId = null;
          }}
        />
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="tool-label"
          title="double-click to rename"
          ondblclick={() => startRename(t.id, t.name)}
        >
          <span style:color={t.color}>▪</span>
          {t.name} {t.w}×{t.h} mm
        </span>
      {/if}
      <button
        class="btn del"
        class:active={ui.editSnapsToolId === t.id}
        title="edit multiconnect snap cells on the canvas"
        onclick={() =>
          (ui.editSnapsToolId = ui.editSnapsToolId === t.id ? null : t.id)}
      >
        {ui.editSnapsToolId === t.id ? "done" : "snaps"}
      </button>
      <button
        class="btn del"
        onclick={() => {
          if (ui.editSnapsToolId === t.id) ui.editSnapsToolId = null;
          plan.tools = plan.tools.filter((x_) => x_.id !== t.id);
        }}
      >
        ×
      </button>
    </div>
  {/each}
</Section>

<style>
  .name {
    margin-bottom: 6px;
  }

  .adder {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    align-items: center;
  }

  .x,
  .unit {
    color: var(--dim);
  }

  .unit {
    font-size: 10px;
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: var(--mono);
    margin-bottom: 4px;
  }

  .tool-label {
    cursor: text;
  }

  .del {
    padding: 1px 6px;
    flex-shrink: 0;
  }
</style>
