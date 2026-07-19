<script lang="ts">
  import { visibleBounds } from "../../core/viewport";
  import { plan, ui } from "../../state/plan.svelte";
  import Section from "./Section.svelte";

  let w = $state(600);
  let h = $state(400);

  function add() {
    if (!(w > 0 && h > 0)) return;
    const vb = visibleBounds(ui.view, ui.canvasSize.w, ui.canvasSize.h);
    let x = (vb.x0 + vb.x1) / 2 - w / 2;
    let y = (vb.y0 + vb.y1) / 2 - h / 2;
    if (ui.snap) {
      x = Math.round(x / plan.pitch) * plan.pitch;
      y = Math.round(y / plan.pitch) * plan.pitch;
    }
    plan.addSurface(w, h, x, y);
  }
</script>

<Section title="Surfaces">
  <div class="adder">
    <input class="input" type="number" bind:value={w} />
    <span class="x">×</span>
    <input class="input" type="number" bind:value={h} />
    <button class="btn" onclick={add}>Add</button>
  </div>
  {#each plan.surfaces as s (s.id)}
    <div class="item">
      <span>{s.w} × {s.h} mm</span>
      <button
        class="btn del"
        onclick={() => (plan.surfaces = plan.surfaces.filter((x_) => x_.id !== s.id))}
      >
        ×
      </button>
    </div>
  {/each}
</Section>

<style>
  .adder {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
    align-items: center;
  }

  .x {
    color: var(--dim);
  }

  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-family: var(--mono);
    margin-bottom: 4px;
  }

  .del {
    padding: 1px 6px;
  }
</style>
