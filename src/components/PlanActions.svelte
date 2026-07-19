<script lang="ts">
  import { exportPlan, importPlan } from "../core/serialize";
  import { blobToDataUrl, dataUrlToBlob } from "../lib/image";
  import { plan, ui } from "../state/plan.svelte";
  import { deleteImageBlob, getImageBlob, saveImageBlob } from "../state/persist";

  let importInput = $state<HTMLInputElement>();
  let error = $state("");

  async function doExport() {
    const blob = plan.image ? await getImageBlob() : null;
    const imageData = blob ? await blobToDataUrl(blob) : null;
    const json = exportPlan(plan.toPlan(), imageData);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = "grid-plan.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImportFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = "";
    try {
      const { plan: imported, imageData } = importPlan(await file.text());
      plan.load(imported);
      ui.calib = null;
      ui.editSnapsToolId = null;
      ui.mode = "move";
      if (imported.image && imageData) {
        const blob = dataUrlToBlob(imageData);
        await saveImageBlob(blob);
        ui.setImageUrl(URL.createObjectURL(blob));
      } else {
        plan.image = null;
        ui.setImageUrl(null);
        await deleteImageBlob();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "import failed";
    }
  }
</script>

<div class="wrap">
  <button class="btn" onclick={doExport}>Export</button>
  <button class="btn" onclick={() => importInput?.click()}>Import</button>
  <input
    bind:this={importInput}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={onImportFile}
  />
  {#if error}
    <div class="error">import failed: {error}</div>
  {/if}
</div>

<style>
  .wrap {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  .hidden {
    display: none;
  }

  .error {
    font-size: 11px;
    font-family: var(--mono);
    color: var(--danger);
    background: rgba(16, 19, 24, 0.85);
    padding: 3px 8px;
    border-radius: 4px;
  }
</style>
