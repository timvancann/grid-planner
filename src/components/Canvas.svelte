<script lang="ts">
  import { cellAt, cellKeyAt, gridLines, parseCellKey } from "../core/grid";
  import { allOccupancy, footprintRange, toolOverlaps } from "../core/occupancy";
  import { segmentActive } from "../core/segment";
  import type { Point } from "../core/types";
  import { toWorld, visibleBounds, zoomAt } from "../core/viewport";
  import { plan, ui } from "../state/plan.svelte";

  let wrap = $state<HTMLDivElement>();
  let svg = $state<SVGSVGElement>();
  const size = $derived(ui.canvasSize);

  type Drag =
    | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { type: "paint"; layer: "active" | "mount"; value: boolean; last: string }
    | {
        type: "obj";
        kind: "image" | "surface" | "tool";
        id: string;
        start: Point;
        orig: Point;
      };
  let drag: Drag | null = null;
  const ptrs = new Map<number, Point>();

  $effect(() => {
    if (!wrap) return;
    const el = wrap;
    const ro = new ResizeObserver(() => {
      ui.canvasSize = { w: el.clientWidth, h: el.clientHeight };
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Wheel zoom about the cursor; must be non-passive to preventDefault.
  $effect(() => {
    if (!svg) return;
    const el = svg;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      ui.view = zoomAt(
        ui.view,
        e.clientX - r.left,
        e.clientY - r.top,
        Math.exp(-e.deltaY * 0.0012),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const vb = $derived(visibleBounds(ui.view, size.w, size.h));
  const lines = $derived(gridLines(vb, plan.pitch, ui.view.ppm));
  const occ = $derived(allOccupancy(plan.tools, plan.pitch, plan.active, plan.mounts));
  const activeArr = $derived([...plan.active].map(parseCellKey));
  const mountArr = $derived([...plan.mounts].map(parseCellKey));
  const fontMm = $derived(11 / ui.view.ppm);
  const px = $derived(1 / ui.view.ppm); // 1 screen px in world mm
  const dimming = $derived(plan.active.size > 0);
  // luminance mask value: white = full dim, black = none
  const objGray = $derived.by(() => {
    const v = Math.round(255 * ui.objectDim);
    return `rgb(${v},${v},${v})`;
  });
  const objectsInteractive = $derived(ui.mode === "move" && !ui.editSnapsToolId);
  const tiles = $derived(segmentActive(plan.active, plan.bed));
  const overlaps = $derived(toolOverlaps(plan.tools));
  const snapEditTool = $derived(
    ui.editSnapsToolId ? (plan.tools.find((t) => t.id === ui.editSnapsToolId) ?? null) : null,
  );

  function worldAt(e: PointerEvent): Point {
    const r = svg!.getBoundingClientRect();
    return toWorld(ui.view, e.clientX - r.left, e.clientY - r.top);
  }

  function paintCell(layer: "active" | "mount", key: string, value: boolean) {
    if (layer === "mount") {
      if (value) {
        plan.mounts.add(key);
        plan.active.add(key); // mounting hardware sits in a printed cell
      } else {
        plan.mounts.delete(key);
      }
    } else if (value) {
      plan.active.add(key);
    } else {
      plan.active.delete(key);
      plan.mounts.delete(key); // an unprinted cell cannot hold a mount
    }
  }

  function snapPos(v: number): number {
    return ui.snap ? Math.round(v / plan.pitch) * plan.pitch : v;
  }

  function capture(e: PointerEvent) {
    try {
      svg!.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort: the pointer may already be gone
    }
  }

  function onBgPointerDown(e: PointerEvent) {
    capture(e);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      drag = null; // second finger down: any pan/paint/drag becomes a pinch
      return;
    }
    const w = worldAt(e);
    if (snapEditTool) {
      // toggle a snap on the clicked footprint cell of the tool being edited
      const t = snapEditTool;
      const fp = footprintRange(t, plan.pitch);
      const c = cellAt(w.x, w.y, plan.pitch);
      if (c.i >= fp.i0 && c.i <= fp.i1 && c.j >= fp.j0 && c.j <= fp.j1) {
        const di = c.i - fp.i0;
        const dj = c.j - fp.j0;
        const snaps = t.snaps ?? [];
        const idx = snaps.findIndex((s) => s.di === di && s.dj === dj);
        const next =
          idx >= 0 ? snaps.filter((_, n) => n !== idx) : [...snaps, { di, dj }];
        plan.tools = plan.tools.map((x) =>
          x.id === t.id ? { ...x, snaps: next.length > 0 ? next : undefined } : x,
        );
      }
      return;
    }
    if (ui.mode === "calibrate" && plan.image) {
      if (!ui.calib?.a) ui.calib = { a: w, b: null, dist: "" };
      else if (!ui.calib.b) ui.calib = { ...ui.calib, b: w };
      return;
    }
    if (ui.mode === "paint" || ui.mode === "mount") {
      const layer = ui.mode === "mount" ? "mount" : "active";
      const key = cellKeyAt(w.x, w.y, plan.pitch);
      const value = layer === "mount" ? !plan.mounts.has(key) : !plan.active.has(key);
      drag = { type: "paint", layer, value, last: key };
      paintCell(layer, key, value);
      return;
    }
    drag = { type: "pan", sx: e.clientX, sy: e.clientY, ox: ui.view.ox, oy: ui.view.oy };
  }

  function startObjectDrag(
    e: PointerEvent,
    kind: "image" | "surface" | "tool",
    obj: { id?: string; x: number; y: number },
  ) {
    if (ui.mode !== "move") return;
    e.stopPropagation();
    capture(e);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = {
      type: "obj",
      kind,
      id: obj.id ?? "",
      start: worldAt(e),
      orig: { x: obj.x, y: obj.y },
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (ptrs.has(e.pointerId)) {
      if (ptrs.size === 2) {
        // pinch: capture old distance/midpoint BEFORE updating the map
        const old = [...ptrs.values()];
        const oldDist = Math.hypot(old[0]!.x - old[1]!.x, old[0]!.y - old[1]!.y);
        const oldMid = { x: (old[0]!.x + old[1]!.x) / 2, y: (old[0]!.y + old[1]!.y) / 2 };
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = [...ptrs.values()];
        const newDist = Math.hypot(now[0]!.x - now[1]!.x, now[0]!.y - now[1]!.y);
        const newMid = { x: (now[0]!.x + now[1]!.x) / 2, y: (now[0]!.y + now[1]!.y) / 2 };
        const r = svg!.getBoundingClientRect();
        // keep the (old) midpoint's world position fixed while scaling
        const v = zoomAt(
          ui.view,
          oldMid.x - r.left,
          oldMid.y - r.top,
          newDist / (oldDist || newDist),
        );
        ui.view = {
          ppm: v.ppm,
          ox: v.ox + (newMid.x - oldMid.x),
          oy: v.oy + (newMid.y - oldMid.y),
        };
        return;
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (!drag) return;
    if (drag.type === "pan") {
      ui.view = {
        ppm: ui.view.ppm,
        ox: drag.ox + (e.clientX - drag.sx),
        oy: drag.oy + (e.clientY - drag.sy),
      };
      return;
    }
    const w = worldAt(e);
    if (drag.type === "paint") {
      const key = cellKeyAt(w.x, w.y, plan.pitch);
      if (key !== drag.last) {
        drag.last = key;
        paintCell(drag.layer, key, drag.value);
      }
      return;
    }
    let nx = drag.orig.x + (w.x - drag.start.x);
    let ny = drag.orig.y + (w.y - drag.start.y);
    if (drag.kind !== "image") {
      nx = snapPos(nx);
      ny = snapPos(ny);
    }
    if (drag.kind === "tool") {
      const id = drag.id;
      plan.tools = plan.tools.map((t) => (t.id === id ? { ...t, x: nx, y: ny } : t));
    } else if (drag.kind === "surface") {
      const id = drag.id;
      plan.surfaces = plan.surfaces.map((s) =>
        s.id === id ? { ...s, x: nx, y: ny } : s,
      );
    } else if (plan.image) {
      plan.image = { ...plan.image, x: nx, y: ny };
    }
  }

  function onPointerUp(e: PointerEvent) {
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) drag = null;
  }

  const cursor = $derived(ui.mode === "move" ? "grab" : "crosshair");
</script>

<div class="wrap" bind:this={wrap}>
  <div class="status">
    {#if snapEditTool}
      click cells under "{snapEditTool.name}" to toggle multiconnect snaps
    {:else if ui.mode === "mount"}
      click cells to toggle mounting hardware (adhesive, screws)
    {:else}
      {ui.view.ppm.toFixed(2)} px/mm, pitch {plan.pitch} mm
      {#if !dimming}, paint cells to define the printed area{/if}
    {/if}
  </div>

  <svg
    bind:this={svg}
    role="application"
    aria-label="plan canvas"
    width={size.w}
    height={size.h}
    style:cursor
    onpointerdown={onBgPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <g transform="translate({ui.view.ox},{ui.view.oy}) scale({ui.view.ppm})">
      <!-- surfaces -->
      {#each plan.surfaces as s (s.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="obj"
          style:pointer-events={objectsInteractive ? "auto" : "none"}
          onpointerdown={(e) => startObjectDrag(e, "surface", s)}
        >
          <rect
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            fill="var(--surface-fill)"
            stroke="var(--surface-stroke)"
            stroke-width={px}
          />
          <text
            x={s.x + 4 * px}
            y={s.y + fontMm * 1.2}
            font-size={fontMm}
            fill="var(--dim)"
            font-family="var(--mono)"
          >
            {s.w}×{s.h}
          </text>
        </g>
      {/each}

      <!-- background image -->
      {#if plan.image && ui.imageUrl}
        {@const im = plan.image}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <image
          href={ui.imageUrl}
          x={im.x}
          y={im.y}
          width={im.natW * im.scale}
          height={im.natH * im.scale}
          opacity={im.opacity}
          preserveAspectRatio="none"
          transform="rotate({im.rot} {im.x + (im.natW * im.scale) / 2} {im.y +
            (im.natH * im.scale) / 2})"
          class="obj"
          style:pointer-events={objectsInteractive && !im.locked ? "auto" : "none"}
          onpointerdown={(e) => startObjectDrag(e, "image", im)}
        />
      {/if}

      <!-- dim overlay with active-cell holes -->
      {#if dimming}
        <mask
          id="activeMask"
          maskUnits="userSpaceOnUse"
          x={vb.x0}
          y={vb.y0}
          width={vb.x1 - vb.x0}
          height={vb.y1 - vb.y0}
        >
          <rect
            x={vb.x0}
            y={vb.y0}
            width={vb.x1 - vb.x0}
            height={vb.y1 - vb.y0}
            fill="white"
          />
          <!-- surfaces/image receive only a fraction of the dim (gray mask);
               active-cell holes are painted after, so they always clear fully -->
          {#each plan.surfaces as s (s.id)}
            <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={objGray} />
          {/each}
          {#if plan.image && ui.imageUrl}
            {@const im = plan.image}
            <rect
              x={im.x}
              y={im.y}
              width={im.natW * im.scale}
              height={im.natH * im.scale}
              transform="rotate({im.rot} {im.x + (im.natW * im.scale) / 2} {im.y +
                (im.natH * im.scale) / 2})"
              fill={objGray}
            />
          {/if}
          {#each activeArr as c (`${c.i},${c.j}`)}
            <rect
              x={c.i * plan.pitch}
              y={c.j * plan.pitch}
              width={plan.pitch}
              height={plan.pitch}
              fill="black"
            />
          {/each}
        </mask>
        <rect
          x={vb.x0}
          y={vb.y0}
          width={vb.x1 - vb.x0}
          height={vb.y1 - vb.y0}
          fill="#05080c"
          opacity="0.72"
          mask="url(#activeMask)"
          pointer-events="none"
        />
        {#each activeArr as c (`b${c.i},${c.j}`)}
          <rect
            x={c.i * plan.pitch}
            y={c.j * plan.pitch}
            width={plan.pitch}
            height={plan.pitch}
            fill="none"
            stroke="var(--accent)"
            stroke-opacity="0.35"
            stroke-width={px}
            pointer-events="none"
          />
        {/each}
      {/if}

      <!-- grid lines -->
      <g pointer-events="none">
        {#each lines.v as x (x)}
          <line
            x1={x}
            y1={vb.y0}
            x2={x}
            y2={vb.y1}
            stroke={x === 0 ? "var(--accent)" : "#e6edf3"}
            stroke-opacity={x === 0 ? 0.5 : lines.step > 1 ? 0.1 : 0.09}
            stroke-width={px}
          />
        {/each}
        {#each lines.h as y (y)}
          <line
            x1={vb.x0}
            y1={y}
            x2={vb.x1}
            y2={y}
            stroke={y === 0 ? "var(--accent)" : "#e6edf3"}
            stroke-opacity={y === 0 ? 0.5 : lines.step > 1 ? 0.1 : 0.09}
            stroke-width={px}
          />
        {/each}
      </g>

      <!-- occupied-cell highlights -->
      {#each occ as o (o.tool.id)}
        {#each o.cells as c (`${o.tool.id}-${c.i}-${c.j}`)}
          <rect
            x={c.i * plan.pitch}
            y={c.j * plan.pitch}
            width={plan.pitch}
            height={plan.pitch}
            fill={c.ok ? "var(--accent)" : "var(--danger)"}
            opacity={c.ok ? 0.18 : 0.3}
            pointer-events="none"
          />
        {/each}
      {/each}

      <!-- mount cells (adhesive / screws): screw-head symbol -->
      <g pointer-events="none">
        {#each mountArr as c (`${c.i},${c.j}`)}
          {@const cx = (c.i + 0.5) * plan.pitch}
          {@const cy = (c.j + 0.5) * plan.pitch}
          {@const r = plan.pitch * 0.18}
          <circle
            {cx}
            {cy}
            {r}
            fill="var(--surface-stroke)"
            fill-opacity="0.5"
            stroke="var(--text)"
            stroke-opacity="0.7"
            stroke-width={px}
          />
          <line
            x1={cx - r * 0.7}
            y1={cy - r * 0.7}
            x2={cx + r * 0.7}
            y2={cy + r * 0.7}
            stroke="var(--text)"
            stroke-opacity="0.7"
            stroke-width={px}
          />
        {/each}
      </g>

      <!-- print-tile boundaries -->
      {#if dimming}
        <g pointer-events="none">
          {#each tiles as t, n (n)}
            <rect
              x={t.i0 * plan.pitch}
              y={t.j0 * plan.pitch}
              width={t.w * plan.pitch}
              height={t.h * plan.pitch}
              fill="none"
              stroke="var(--accent)"
              stroke-opacity="0.8"
              stroke-width={1.5 * px}
              stroke-dasharray="{6 * px} {4 * px}"
            />
            <text
              x={t.i0 * plan.pitch + 3 * px}
              y={t.j0 * plan.pitch - 4 * px}
              font-size={fontMm * 0.85}
              fill="var(--accent)"
              fill-opacity="0.8"
              font-family="var(--mono)"
            >
              {t.w}×{t.h}
            </text>
          {/each}
        </g>
      {/if}

      <!-- tools -->
      {#each occ as o (o.tool.id)}
        {@const t = o.tool}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g
          class="obj"
          style:pointer-events={objectsInteractive ? "auto" : "none"}
          onpointerdown={(e) => startObjectDrag(e, "tool", t)}
        >
          <rect
            x={t.x}
            y={t.y}
            width={t.w}
            height={t.h}
            rx={2 * px}
            fill={t.color}
            fill-opacity="0.25"
            stroke={o.conflict ? "var(--danger)" : t.color}
            stroke-width={1.5 * px}
          />
          <text
            x={t.x + t.w / 2}
            y={t.y + t.h / 2}
            font-size={fontMm}
            fill="#fff"
            font-family="var(--mono)"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {t.name}
          </text>
          {#if t.snaps && t.snaps.length > 0}
            {#each o.cells as c (`${c.i},${c.j}`)}
              <circle
                cx={(c.i + 0.5) * plan.pitch}
                cy={(c.j + 0.5) * plan.pitch}
                r={plan.pitch * 0.14}
                fill={c.ok ? t.color : "var(--danger)"}
                stroke="#fff"
                stroke-opacity="0.6"
                stroke-width={px}
                pointer-events="none"
              />
            {/each}
          {/if}
        </g>
      {/each}

      <!-- tool body overlaps -->
      {#each overlaps as o (`${o.aId}-${o.bId}`)}
        <g pointer-events="none">
          <rect
            x={o.x}
            y={o.y}
            width={o.w}
            height={o.h}
            fill="var(--danger)"
            fill-opacity="0.45"
            stroke="var(--danger)"
            stroke-width={1.5 * px}
          />
          <line
            x1={o.x}
            y1={o.y}
            x2={o.x + o.w}
            y2={o.y + o.h}
            stroke="var(--danger)"
            stroke-width={px}
          />
          <line
            x1={o.x + o.w}
            y1={o.y}
            x2={o.x}
            y2={o.y + o.h}
            stroke="var(--danger)"
            stroke-width={px}
          />
        </g>
      {/each}

      <!-- snap editing overlay -->
      {#if snapEditTool}
        {@const t = snapEditTool}
        {@const fp = footprintRange(t, plan.pitch)}
        <g pointer-events="none">
          {#each Array.from({ length: fp.i1 - fp.i0 + 1 }, (_, n) => fp.i0 + n) as i (i)}
            {#each Array.from({ length: fp.j1 - fp.j0 + 1 }, (_, n) => fp.j0 + n) as j (j)}
              {@const hasSnap = (t.snaps ?? []).some(
                (s) => s.di === i - fp.i0 && s.dj === j - fp.j0,
              )}
              <rect
                x={i * plan.pitch}
                y={j * plan.pitch}
                width={plan.pitch}
                height={plan.pitch}
                fill={hasSnap ? t.color : "none"}
                fill-opacity="0.35"
                stroke="#fff"
                stroke-opacity="0.5"
                stroke-width={px}
                stroke-dasharray="{3 * px} {3 * px}"
              />
              {#if hasSnap}
                <circle
                  cx={(i + 0.5) * plan.pitch}
                  cy={(j + 0.5) * plan.pitch}
                  r={plan.pitch * 0.14}
                  fill={t.color}
                  stroke="#fff"
                  stroke-width={px}
                />
              {/if}
            {/each}
          {/each}
        </g>
      {/if}

      <!-- calibration annotation (CAD-style dimension line) -->
      {#if ui.calib?.a}
        {@const a = ui.calib.a}
        <g pointer-events="none">
          <circle cx={a.x} cy={a.y} r={4 * px} fill="none" stroke="var(--accent)" stroke-width={1.5 * px} />
          <line x1={a.x - 7 * px} y1={a.y} x2={a.x + 7 * px} y2={a.y} stroke="var(--accent)" stroke-width={px} />
          <line x1={a.x} y1={a.y - 7 * px} x2={a.x} y2={a.y + 7 * px} stroke="var(--accent)" stroke-width={px} />
          {#if ui.calib.b}
            {@const b = ui.calib.b}
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--accent)"
              stroke-width={px}
              stroke-dasharray="{4 * px} {3 * px}"
            />
            <circle cx={b.x} cy={b.y} r={4 * px} fill="none" stroke="var(--accent)" stroke-width={1.5 * px} />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 8 * px}
              font-size={fontMm}
              fill="var(--accent)"
              font-family="var(--mono)"
              text-anchor="middle"
            >
              {Math.hypot(b.x - a.x, b.y - a.y).toFixed(1)} mm (current)
            </text>
          {/if}
        </g>
      {/if}
    </g>

    {#if !plan.image && plan.surfaces.length === 0}
      <text
        x={size.w / 2}
        y={size.h / 2}
        text-anchor="middle"
        fill="var(--dim)"
        font-size="13"
        font-family="var(--mono)"
      >
        Upload a photo of your surface, or add a surface by its dimensions.
      </text>
    {/if}
  </svg>
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
  }

  svg {
    display: block;
    touch-action: none;
    background: var(--bg);
  }

  .obj {
    cursor: move;
  }

  .status {
    position: absolute;
    bottom: 10px;
    left: 10px;
    z-index: 5;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--dim);
    background: rgba(16, 19, 24, 0.8);
    padding: 3px 8px;
    border-radius: 4px;
    pointer-events: none;
  }
</style>
