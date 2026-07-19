<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<div class="row">
  <div class="label">{label}</div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .label {
    font-size: 11px;
    color: var(--dim);
    width: 70px;
    flex-shrink: 0;
  }

  .control {
    flex: 1;
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
</style>
