<script lang="ts">
  import { footprintRange } from "../../core/occupancy";
  import { visibleBounds } from "../../core/viewport";
  import { plan, ui } from "../../state/plan.svelte";
  import Section from "./Section.svelte";

  let name = $state("Tool");
  let w = $state(84);
  let h = $state(56);

  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editW = $state(0);
  let editH = $state(0);

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

  function startEdit(t: { id: string; name: string; w: number; h: number }) {
    editingId = t.id;
    editName = t.name;
    editW = t.w;
    editH = t.h;
  }

  function commitEdit() {
    const id = editingId;
    if (id !== null) {
      plan.tools = plan.tools.map((t) => {
        if (t.id !== id) return t;
        const name = editName.trim() || t.name;
        const nw = editW > 0 ? editW : t.w;
        const nh = editH > 0 ? editH : t.h;
        // drop snap offsets that fall outside the resized footprint
        const fp = footprintRange({ ...t, w: nw, h: nh }, plan.pitch);
        const cols = fp.i1 - fp.i0 + 1;
        const rows = fp.j1 - fp.j0 + 1;
        const snaps = t.snaps?.filter((s) => s.di < cols && s.dj < rows);
        return {
          ...t,
          name,
          w: nw,
          h: nh,
          snaps: snaps && snaps.length > 0 ? snaps : undefined,
        };
      });
    }
    editingId = null;
  }

  function editKeys(e: KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") editingId = null;
  }

  // 90 deg clockwise: w/h swap, snap cell (di, dj) -> (rows-1-dj, di)
  function rotateTool(id: string) {
    plan.tools = plan.tools.map((t) => {
      if (t.id !== id) return t;
      const fp = footprintRange(t, plan.pitch);
      const rows = fp.j1 - fp.j0 + 1;
      const snaps = t.snaps?.map((s) => ({ di: rows - 1 - s.dj, dj: s.di }));
      return { ...t, w: t.h, h: t.w, ...(snaps ? { snaps } : {}) };
    });
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
        <div class="editor">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input"
            type="text"
            placeholder="name"
            autofocus
            bind:value={editName}
            onkeydown={editKeys}
          />
          <div class="dims">
            <input class="input" type="number" title="width (mm)" bind:value={editW} onkeydown={editKeys} />
            <span class="x">×</span>
            <input class="input" type="number" title="height (mm)" bind:value={editH} onkeydown={editKeys} />
            <button class="btn" onclick={commitEdit}>✓</button>
          </div>
        </div>
      {:else}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="tool-label"
          title="double-click to edit name and size"
          ondblclick={() => startEdit(t)}
        >
          <span style:color={t.color}>▪</span>
          {t.name} {t.w}×{t.h} mm
        </span>
      {/if}
      <div class="actions">
        <button class="btn del" title="rotate 90°" onclick={() => rotateTool(t.id)}>
          ⇄
        </button>
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
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: var(--mono);
    margin-bottom: 4px;
  }

  .actions {
    margin-left: auto;
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .tool-label {
    cursor: text;
  }

  .editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .dims {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .del {
    padding: 1px 6px;
    flex-shrink: 0;
  }
</style>
