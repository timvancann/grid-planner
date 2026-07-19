import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// base must match the GitHub repo name, otherwise assets 404 on Pages
export default defineConfig({
  base: "/grid-planner/",
  plugins: [svelte()],
});
