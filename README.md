# grid planner

**Use it directly at [timvancann.github.io/grid-planner](https://timvancann.github.io/grid-planner/)**, no install needed. The app is fully client-side: your photos and plans are processed and stored in your own browser (IndexedDB) and never leave your machine.

A client-only, mm-accurate planning tool for grid wall/surface systems such as [openGrid](https://www.printables.com/model/1214361-opengrid-wall-framework-ecosystem) and [Gridfinity](https://gridfinity.xyz/). Calibrate a photo of your surface against a real-world distance, paint which grid cells will be printed, mark mounting cells (adhesive, screws), and place tools to check cell occupancy, conflicts, and overlaps. Print segmentation splits the painted area into balanced, bed-sized tiles. No backend; state persists in the browser (IndexedDB).

## Develop

```sh
just run     # dev server (or: pnpm dev)
just test    # core-model tests (Vitest)
just check   # svelte-check type checking
just build   # production build
```

## Architecture

The core model (`src/core/`) is framework-free TypeScript: geometry, calibration math, occupancy, segmentation, and serialization have zero Svelte imports and are covered by the tests in `tests/`. Svelte 5 components are thin views over it. See `SPEC.md` for the full design.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup:

1. Create a GitHub repo named `grid-planner` (the name must match `base` in `vite.config.ts`).
2. In the repo settings under Pages, set the source to "GitHub Actions".
3. Push to `main`.
