<script lang="ts">
  import { calibrateImage } from "../../core/calibrate";
  import { processImageFile } from "../../lib/image";
  import { plan, ui } from "../../state/plan.svelte";
  import { saveImageBlob } from "../../state/persist";
  import Row from "./Row.svelte";
  import Section from "./Section.svelte";

  let fileInput = $state<HTMLInputElement>();

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const { blob, natW, natH } = await processImageFile(file);
    await saveImageBlob(blob);
    ui.setImageUrl(URL.createObjectURL(blob));
    plan.setImageFromUpload(natW, natH);
    ui.mode = "calibrate";
    ui.calib = null;
  }

  function applyCalibration() {
    const c = ui.calib;
    if (!plan.image || !c?.a || !c.b) return;
    const next = calibrateImage(plan.image, c.a, c.b, parseFloat(c.dist));
    if (!next) return;
    plan.image = next;
    ui.calib = null;
    ui.mode = "move";
  }

  function cancelCalibration() {
    ui.calib = null;
    ui.mode = "move";
  }

  function removeImage() {
    plan.image = null;
    ui.setImageUrl(null);
    ui.calib = null;
    if (ui.mode === "calibrate") ui.mode = "move";
    // the blob stays in IndexedDB so undo can restore the image; it is
    // cleared on reset or overwritten by the next upload
  }
</script>

<Section title="Background image">
  {#if !plan.image}
    <button class="btn" onclick={() => fileInput?.click()}>Upload image…</button>
  {:else}
    {@const im = plan.image}
    <Row label="scale">
      <input
        class="input"
        type="number"
        step="0.001"
        value={+im.scale.toFixed(4)}
        onchange={(e) => {
          const v = parseFloat(e.currentTarget.value);
          plan.image = { ...im, scale: v > 1e-4 ? v : im.scale };
        }}
      />
      <span class="unit">mm/px</span>
    </Row>
    <Row label="rotation">
      <input
        class="input deg"
        type="number"
        step="0.1"
        value={im.rot}
        onchange={(e) =>
          (plan.image = { ...im, rot: parseFloat(e.currentTarget.value) || 0 })}
      />
      <input
        class="slider"
        type="range"
        min="-180"
        max="180"
        step="0.1"
        value={im.rot}
        oninput={(e) =>
          (plan.image = { ...im, rot: parseFloat(e.currentTarget.value) })}
      />
    </Row>
    <Row label="opacity">
      <input
        class="slider"
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        value={im.opacity}
        oninput={(e) =>
          (plan.image = { ...im, opacity: parseFloat(e.currentTarget.value) })}
      />
    </Row>
    <Row label="size">
      <span class="mono">
        {(im.natW * im.scale).toFixed(0)} × {(im.natH * im.scale).toFixed(0)} mm
      </span>
    </Row>
    <div class="actions">
      <button
        class="btn"
        class:active={ui.mode === "calibrate"}
        onclick={() => {
          ui.mode = "calibrate";
          ui.calib = null;
        }}
      >
        Calibrate
      </button>
      <button
        class="btn"
        class:active={im.locked}
        onclick={() => (plan.image = { ...im, locked: !im.locked })}
      >
        {im.locked ? "Locked" : "Lock"}
      </button>
      <button class="btn" onclick={removeImage}>Remove</button>
    </div>
    {#if ui.mode === "calibrate"}
      <div class="calib-box">
        {#if !ui.calib?.a}
          <div class="step">Click first reference point on the canvas.</div>
        {:else if !ui.calib.b}
          <div class="step">Click second reference point.</div>
        {:else}
          <div class="prompt">Real distance between points:</div>
          <div class="dist">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="input"
              type="number"
              placeholder="mm"
              autofocus
              bind:value={ui.calib.dist}
              onkeydown={(e) => e.key === "Enter" && applyCalibration()}
            />
            <button class="btn active" onclick={applyCalibration}>Set</button>
          </div>
        {/if}
        <button class="btn cancel" onclick={cancelCalibration}>Cancel</button>
      </div>
    {/if}
  {/if}
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={onFile}
  />
</Section>

<style>
  .unit {
    font-size: 10px;
    color: var(--dim);
    flex-shrink: 0;
  }

  .deg {
    width: 64px;
    flex: none;
  }

  .slider {
    flex: 1;
    min-width: 0;
  }

  .mono {
    font-family: var(--mono);
    font-size: 11px;
  }

  .actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    flex-wrap: wrap;
  }

  .calib-box {
    margin-top: 8px;
    padding: 8px;
    background: var(--input-bg);
    border-radius: 4px;
    border: 1px solid var(--panel-border);
  }

  .step {
    font-size: 11px;
    color: var(--accent);
  }

  .prompt {
    font-size: 11px;
    color: var(--dim);
    margin-bottom: 6px;
  }

  .dist {
    display: flex;
    gap: 6px;
  }

  .cancel {
    margin-top: 6px;
  }

  .hidden {
    display: none;
  }
</style>
