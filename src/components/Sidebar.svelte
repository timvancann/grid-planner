<script lang="ts">
  import GridPanel from "./panels/GridPanel.svelte";
  import ImagePanel from "./panels/ImagePanel.svelte";
  import PlanPanel from "./panels/PlanPanel.svelte";
  import StatsPanel from "./panels/StatsPanel.svelte";
  import SurfacesPanel from "./panels/SurfacesPanel.svelte";
  import ToolsPanel from "./panels/ToolsPanel.svelte";
</script>

<div class="title"><span class="mark">▦</span> grid planner</div>
<GridPanel />
<ImagePanel />
<SurfacesPanel />
<ToolsPanel />
<StatsPanel />
<PlanPanel />

<style>
  .title {
    padding: 12px 12px 8px;
    font-family: var(--mono);
    font-size: 14px;
    letter-spacing: 0.5px;
  }

  .mark {
    color: var(--accent);
  }
</style>
