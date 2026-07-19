# OpenGrid Planner — Implementation Spec

Build a client-only, mm-accurate planning tool for [openGrid](https://www.printables.com/model/1214361-opengrid-wall-framework-ecosystem) layouts. Users calibrate a photo of their surface (desk, wall, drawer) against a real-world distance, paint which grid cells will be printed, and place tools to see cell occupancy. No backend. Deployed to GitHub Pages, state persisted in the browser.

A working React prototype exists (`opengrid-planner.jsx`, may be provided alongside this spec). Treat it as a **behavioral reference**, not code to port line-by-line — the architecture below supersedes its structure. All algorithms it contains are restated explicitly in this document, so the spec is self-contained.

---

## 1. Stack

| Concern         | Decision                                                               | Notes                                                                            |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Framework       | **Vite + Svelte 5** (runes), plain — **not** SvelteKit                 | No routing, no SSR. `npm create vite@latest -- --template svelte-ts` equivalent. |
| Language        | TypeScript, strict                                                     |                                                                                  |
| Package manager | **pnpm** (or bun if already configured; pick one, commit the lockfile) |                                                                                  |
| Styling         | Scoped Svelte styles + one global token stylesheet                     | **No Tailwind, no CSS framework.**                                               |
| Persistence     | IndexedDB via `idb-keyval`                                             | Not localStorage (quota too small for images).                                   |
| Testing         | Vitest for the core model (pure TS)                                    | No component tests required initially.                                           |
| Deploy          | GitHub Actions → `actions/deploy-pages`                                |                                                                                  |

## 2. Architectural rule (most important constraint)

**The core model is framework-free.** All geometry, state types, calibration math, occupancy computation, and serialization live in plain TypeScript modules under `src/core/` with **zero Svelte imports**. Svelte components are thin views: they hold reactive state (runes) and call core functions. This keeps the geometry unit-testable and makes future features (tile segmentation) safe to develop.

If at any point a core function needs to import from a `.svelte` file, the design is wrong — stop and restructure.

## 3. Repo structure

```
opengrid-planner/
├── .github/workflows/deploy.yml
├── index.html
├── vite.config.ts            # base: '/opengrid-planner/' (or actual repo name)
├── package.json
├── src/
│   ├── main.ts
│   ├── App.svelte
│   ├── app.css               # design tokens (:root custom properties), resets
│   ├── core/
│   │   ├── types.ts          # Plan, Tool, Surface, CalibrationState, ViewState...
│   │   ├── viewport.ts       # world<->screen transforms, visible bounds, zoom-about-point
│   │   ├── grid.ts           # cell keys, grid line generation (with decimation)
│   │   ├── calibrate.ts      # two-point scale calibration math
│   │   ├── occupancy.ts      # tool -> covered cells, conflict detection
│   │   ├── paint.ts          # active-cell set operations
│   │   └── serialize.ts      # versioned schema, export/import JSON, migrations
│   ├── state/
│   │   ├── plan.svelte.ts    # reactive plan state (runes) wrapping core types
│   │   └── persist.ts        # idb-keyval autosave/load, image blob handling
│   ├── lib/
│   │   └── image.ts          # file -> downscaled Blob, blob <-> objectURL
│   └── components/
│       ├── Canvas.svelte     # SVG viewport, pointer handling, all render layers
│       ├── Sidebar.svelte
│       ├── panels/           # GridPanel, ImagePanel, SurfacesPanel, ToolsPanel,
│       │                     # StatsPanel, PlanPanel (export/import/reset)
│       └── Toolbar.svelte    # mode switcher overlay
└── tests/
    ├── calibrate.test.ts
    ├── occupancy.test.ts
    └── serialize.test.ts
```

## 4. Coordinate system & core types

- **World space is millimetres.** Grid origin fixed at world `(0,0)`; the grid never moves. Images, surfaces, and tools move relative to it.
- **View transform:** `screen = world * ppm + origin` where `ppm` = pixels per mm. Pan/zoom only ever mutates the view, never geometry.
- **Cells** are indexed `(i, j) = (floor(x / pitch), floor(y / pitch))`, valid for negatives via `Math.floor`. Cell key string format: `"${i},${j}"`.
- Default `pitch = 28` (openGrid standard), user-editable.

```ts
// core/types.ts (essence — extend as needed)
export interface ViewState {
  ppm: number;
  ox: number;
  oy: number;
}

export interface PlanImage {
  blobKey: string; // reference into IndexedDB, NOT a dataURL
  natW: number;
  natH: number;
  scale: number; // mm per image pixel
  x: number;
  y: number; // world position of unrotated top-left, mm
  rot: number; // degrees, rotation about image center
  opacity: number;
  locked: boolean;
}

export interface Surface {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Tool {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface Plan {
  version: 1; // schema version — bump + migrate, never break saves
  pitch: number;
  image: PlanImage | null;
  surfaces: Surface[];
  tools: Tool[];
  active: string[]; // serialized form of Set<cellKey>
}
```

## 5. Feature specifications

### 5.1 Viewport (pan/zoom)

- Wheel zoom about the cursor: with cursor screen pos `(sx, sy)`, world point under cursor `w = (s - o) / ppm` must be invariant, so `o' = s - w * ppm'`. Clamp `ppm` to `[0.05, 30]`. Attach the wheel listener **non-passively** (`preventDefault`).
- Drag-to-pan on background in _move_ mode.
- **Pinch zoom** for touch: track active pointers in a Map; with exactly two pointers, scale `ppm` by the ratio of new/old pointer distance and keep the midpoint's world position fixed (same invariant as wheel). `touch-action: none` on the SVG.
- Zoom `+`/`−`/`fit` buttons are welcome additions (fit = bounding box of surfaces ∪ active cells ∪ image, with margin).

### 5.2 Image upload & calibration

- Upload → downscale client-side in `lib/image.ts`: cap the long edge at **2048 px** via an offscreen canvas, re-encode to a `Blob` (JPEG q≈0.85 for photos; keep PNG if source is PNG). Store the Blob in IndexedDB; hold an object URL at runtime.
- Initial placement: `scale` such that image width ≈ 1000 mm, positioned at origin. Enter calibrate mode automatically after upload.
- **Calibration flow:** user clicks point A, then point B, on the canvas (world coords), then enters the real distance `D` mm. Show a CAD-style dimension annotation between the points with the _current_ distance readout while waiting for input.
- **Calibration math.** Let `d = |b − a|` (world mm at current scale), ratio `r = D / d`, new scale `s' = s·r`. Anchor the **first clicked point** so it stays fixed in world space. With rotation about the image center `C`:

  ```
  C  = (x + natW·s/2,  y + natH·s/2)
  C' = a − r·(a − C)
  x' = C'.x − natW·s'/2
  y' = C'.y − natH·s'/2
  ```

  This is exact for any rotation angle because distances are rotation-invariant and the image scales about a fixed anchor. Include this derivation as a comment in `calibrate.ts` and cover it with tests (θ = 0 and θ ≠ 0 cases: point A's world position must be unchanged after applying calibration).

- Also expose the raw `scale` (mm/px) as an editable numeric input — users may know it from scanner DPI.
- **Rotation:** numeric degree input (step 0.1) + slider, range −180..180, rotation about image center. Rotation and calibration must compose in either order.
- Image is draggable in move mode unless `locked`. Lock toggle in the panel.

### 5.3 Surfaces (alternative to image)

- User enters `w × h` mm; surface spawns centered in the current view (snapped if snap is on). Draggable rects with a dimension label. Any number of them. Delete from the panel list.

### 5.4 Active cells (paint mode)

- Distinct _paint_ mode. Pointer-down determines the target value as the **negation of the first cell's state**; dragging paints that same value across cells (track last cell key to avoid churn). Objects (image/tools/surfaces) get `pointer-events: none` while painting so cells under them are reachable.
- Active cells stored as `Set<string>` of cell keys.
- **Dimming:** when at least one cell is active, overlay a dark rect (≈ 72% opacity `#05080c`) over the visible viewport with an SVG mask that punches holes at active cells, plus a subtle accent-colored border on each active cell. When the active set is empty, no dimming (otherwise the user starts blind) — show a hint instead.
- Painting is allowed on the infinite grid, not clipped to surfaces (surfaces are optional guides). Fine to add an optional "clip to surfaces" toggle later.

### 5.5 Tools & occupancy

- User defines tools by name + `w × h` mm; spawn centered in view; drag in move mode; assign colors from a small cycling palette.
- **Snap** (global toggle, default **on**): tool and surface positions round to multiples of `pitch`. Rationale: openGrid tools mount on cell-quantized snaps, so free positioning is rarely meaningful.
- **Occupancy:** covered cells of a tool with ε = 0.5 mm (so edge-touching does not count):

  ```
  i0 = floor((x + ε) / pitch)      i1 = floor((x + w − ε) / pitch)
  j0 = floor((y + ε) / pitch)      j1 = floor((y + h − ε) / pitch)
  ```

  Every covered cell is highlighted; cells that are covered but **not active** render in the danger color and set a per-tool `conflict` flag, surfaced both on the tool outline (red stroke) and in the stats panel.

### 5.6 Grid rendering

- Vertical/horizontal lines across the visible world bounds only. When `pitch · ppm < 6 px`, decimate to every 5th line; hard cap ≈ 600 lines per axis (render none beyond — pure noise at that zoom). Axis lines through world 0 get the accent color at higher opacity.
- Render order (bottom → top): surfaces → image → dim overlay + active borders → grid lines → occupancy highlights → tools → calibration annotation.

### 5.7 Stats panel

Active cell count, active area in m², distinct occupied cell count, conflict warning. Add: bounding box of the active set in cells and mm.

### 5.8 Persistence

- `state/persist.ts`: debounced autosave (~500 ms) of the full `Plan` to IndexedDB via `idb-keyval` on any state change. Image blob stored under its own key; `Plan.image.blobKey` references it. Load on startup; revoke stale object URLs.
- Keep explicit **Export/Import JSON** (this remains the only cross-device path — IndexedDB is per-origin, per-device). Export embeds the image as base64 inside the JSON so a plan file is fully self-contained; import decodes it back to a Blob.
- `serialize.ts` owns the schema: a `migrate(raw: unknown): Plan` function that validates and upgrades old versions. Even at version 1, route all loads through it.
- Add a "Reset plan" action (with confirm) that clears IndexedDB state.

## 6. UI / visual design

Dark technical-viewport aesthetic; all numerals and labels in a monospace stack. Design tokens in `app.css`:

```css
:root {
  --bg: #101318;
  --panel: #171b21;
  --panel-border: #232a33;
  --text: #d7dde3;
  --dim: #8b95a1;
  --accent: #f2a33c;
  --danger: #e5484d;
  --surface-fill: #2b333d;
  --surface-stroke: #4a5666;
  --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
}
```

Layout: fixed left sidebar (~250 px, own scroll) with sections _Grid, Background image, Surfaces, Tools, Stats, Plan_; canvas fills the rest. Mode toolbar (Move / Paint cells) floats top-left over the canvas; a status line (px/mm, pitch, hints) bottom-left. Tool colors: `#53c2e8 #8ab4f8 #6fd08c #c792ea #f78c6c`. Text inside the SVG uses `fontSize = 11 / ppm` so it stays constant on screen. Keep the chrome quiet — the canvas is the product.

Responsive floor: on narrow viewports the sidebar may collapse behind a toggle; pointer interactions must already work on touch (see pinch above). No further mobile optimization required now.

## 7. Deployment (GitHub Pages)

- `vite.config.ts`: `base: '/<repo-name>/'` — without this, assets 404 on Pages.
- Workflow `.github/workflows/deploy.yml`: on push to `main` → setup pnpm → install → `vite build` → upload `dist` via `actions/upload-pages-artifact` → `actions/deploy-pages`. Standard permissions block (`pages: write`, `id-token: write`). Enable Pages "GitHub Actions" source in repo settings (note this in the README).

## 8. Tests (Vitest, core only)

Minimum coverage:

- `calibrate`: anchor point invariance at θ = 0 and θ = 37°; scale ratio correctness; composing rotate→calibrate vs calibrate→rotate yields consistent geometry.
- `occupancy`: exact-fit tool (w = n·pitch, snapped) covers exactly n cells per axis; edge-touching neighbor cell excluded by ε; negative-coordinate cells; conflict flag.
- `serialize`: round-trip export→import equality; `migrate` rejects garbage gracefully.
- `grid`: cell key for negative coordinates; line decimation thresholds.

## 9. Implementation order

1. Scaffold (Vite + Svelte 5 + TS strict + Vitest), tokens, empty layout.
2. `core/viewport` + Canvas with pan/wheel/pinch and grid rendering.
3. Surfaces + snap + drag.
4. Paint mode + dim overlay + stats.
5. Tools + occupancy + conflicts.
6. Image upload, downscaling, drag/rotate/opacity/lock.
7. Calibration flow + math + tests.
8. Persistence (IndexedDB autosave/load) + export/import + reset.
9. Deploy workflow; verify on Pages with correct `base`.

Each step should leave the app runnable. Write the core-module tests alongside steps 5, 7, 8 — not deferred to the end.

## 10. Explicit non-goals (for now)

- No backend, accounts, or sharing links.
- No tile segmentation / print-bed partitioning yet — but it is the known next feature (rectangle cover of the active set constrained to a 256 mm bed ≈ 9×9 cells), which is _why_ the core must stay framework-free and tested.
- No edge/half-cell features (Underware channels, edge clips) — but choose the cell key schema knowing finer granularity may come; do not paint yourself into `"i,j"` strings being load-bearing across the codebase (centralize key encode/decode in `grid.ts`).
- No undo/redo yet; structure state mutations so a command/undo layer can wrap them later (prefer pure `(plan, action) → plan`-style helpers in core over ad-hoc mutation in components).
