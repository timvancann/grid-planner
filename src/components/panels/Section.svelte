<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="section">
  <div class="heading">{title}</div>
  {@render children()}
</div>

<style>
  .section {
    border-bottom: 1px solid var(--panel-border);
    padding: 10px 12px;
  }

  .heading {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 8px;
    font-family: var(--mono);
  }
</style>
