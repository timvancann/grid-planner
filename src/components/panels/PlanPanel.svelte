<script lang="ts">
  import { plan, ui } from "../../state/plan.svelte";
  import { clearPersisted } from "../../state/persist";
  import Section from "./Section.svelte";

  async function doReset() {
    if (!confirm("Reset the plan? This clears the saved state.")) return;
    await clearPersisted();
    plan.reset();
    ui.setImageUrl(null);
    ui.calib = null;
    ui.editSnapsToolId = null;
    ui.mode = "move";
  }
</script>

<Section title="Plan">
  <button class="btn" onclick={doReset}>Reset plan</button>
</Section>
