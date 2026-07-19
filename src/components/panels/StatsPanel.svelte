<script lang="ts">
  import { allOccupancy, occupiedCellCount, toolOverlaps } from "../../core/occupancy";
  import { activeAreaM2, activeCellBounds } from "../../core/paint";
  import { segmentActive } from "../../core/segment";
  import { plan } from "../../state/plan.svelte";
  import Section from "./Section.svelte";

  const occ = $derived(allOccupancy(plan.tools, plan.pitch, plan.active, plan.mounts));
  const bbox = $derived(activeCellBounds(plan.active));
  const conflicts = $derived(occ.filter((o) => o.conflict));
  const tiles = $derived(segmentActive(plan.active, plan.bed));
  // aggregate tiles into a print shopping list, largest first
  const printList = $derived.by(() => {
    const m = new Map<string, { w: number; h: number; n: number }>();
    for (const t of tiles) {
      const k = `${t.w}×${t.h}`;
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { w: t.w, h: t.h, n: 1 });
    }
    return [...m.values()].sort((a, b) => b.w * b.h - a.w * a.h);
  });
  const overlaps = $derived(toolOverlaps(plan.tools));
  const toolName = (id: string) => plan.tools.find((t) => t.id === id)?.name ?? "?";
</script>

<Section title="Stats">
  <div class="stats">
    <div>active cells: <span class="accent">{plan.active.size}</span></div>
    <div>grid area: {activeAreaM2(plan.active, plan.pitch).toFixed(3)} m²</div>
    <div>occupied: {occupiedCellCount(occ)} cells</div>
    {#if plan.mounts.size > 0}
      <div>mounts: {plan.mounts.size} cells</div>
    {/if}
    {#if bbox}
      {@const cw = bbox.i1 - bbox.i0 + 1}
      {@const ch = bbox.j1 - bbox.j0 + 1}
      <div>painted bbox: {cw} × {ch} cells</div>
      <div>painted bbox: {cw * plan.pitch} × {ch * plan.pitch} mm</div>
      {#if tiles.length === 1}
        <div>fits printer bed ({plan.bed.w} × {plan.bed.h})</div>
      {:else}
        <div>prints: {tiles.length} (bed {plan.bed.w} × {plan.bed.h})</div>
      {/if}
      <div>
        print list: {printList.map((e) => `${e.n}× ${e.w}×${e.h}`).join(", ")}
      </div>
    {/if}
    {#each overlaps as o (`${o.aId}-${o.bId}`)}
      <div class="danger">⚠ {toolName(o.aId)} overlaps {toolName(o.bId)}</div>
    {/each}
    {#if conflicts.length > 0}
      <div class="danger">
        ⚠ {conflicts.length === 1
          ? `${conflicts[0]?.tool.name} over inactive cell`
          : `${conflicts.length} tools over inactive cells`}
      </div>
    {/if}
  </div>
</Section>

<style>
  .stats {
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.8;
  }

  .accent {
    color: var(--accent);
  }

  .danger {
    color: var(--danger);
  }
</style>
