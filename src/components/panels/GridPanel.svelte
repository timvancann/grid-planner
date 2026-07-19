<script lang="ts">
  import { plan, ui } from "../../state/plan.svelte";
  import Row from "./Row.svelte";
  import Section from "./Section.svelte";

  const PRESETS = [
    { id: "opengrid", label: "openGrid (28 mm)", pitch: 28 },
    { id: "gridfinity", label: "Gridfinity (42 mm)", pitch: 42 },
  ] as const;

  // explicit flag so picking "custom" sticks even while pitch still equals a
  // preset value; otherwise the select would snap back on the next render
  let customChosen = $state(false);
  const preset = $derived(
    customChosen
      ? "custom"
      : (PRESETS.find((p) => p.pitch === plan.pitch)?.id ?? "custom"),
  );

  function onPreset(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value;
    const p = PRESETS.find((x) => x.id === id);
    customChosen = !p;
    if (p) plan.pitch = p.pitch;
  }
</script>

<Section title="Grid">
  <Row label="pitch">
    <select class="input" value={preset} onchange={onPreset}>
      {#each PRESETS as p (p.id)}
        <option value={p.id}>{p.label}</option>
      {/each}
      <option value="custom">custom</option>
    </select>
  </Row>
  {#if preset === "custom"}
    <Row label="pitch (mm)">
      <input
        class="input"
        type="number"
        min="1"
        step="0.5"
        value={plan.pitch}
        onchange={(e) =>
          (plan.pitch = Math.max(1, parseFloat(e.currentTarget.value) || 28))}
      />
    </Row>
  {/if}
  <Row label="bed (cells)">
    <input
      class="input"
      type="number"
      min="1"
      step="1"
      title="printer bed width in grid cells"
      value={plan.bed.w}
      onchange={(e) =>
        (plan.bed = {
          ...plan.bed,
          w: Math.max(1, Math.floor(parseFloat(e.currentTarget.value) || 6)),
        })}
    />
    <span class="x">×</span>
    <input
      class="input"
      type="number"
      min="1"
      step="1"
      title="printer bed height in grid cells"
      value={plan.bed.h}
      onchange={(e) =>
        (plan.bed = {
          ...plan.bed,
          h: Math.max(1, Math.floor(parseFloat(e.currentTarget.value) || 6)),
        })}
    />
  </Row>
  <Row label="snap">
    <input type="checkbox" bind:checked={ui.snap} />
    <span class="hint">tools & surfaces to pitch</span>
  </Row>
  <Row label="object dim">
    <input
      class="slider"
      type="range"
      min="0"
      max="1"
      step="0.05"
      bind:value={ui.objectDim}
      title="how much painting dims the image and surfaces"
    />
  </Row>
</Section>

<style>
  .hint {
    font-size: 11px;
    color: var(--dim);
  }

  .x {
    color: var(--dim);
  }

  .slider {
    width: 100%;
  }
</style>
