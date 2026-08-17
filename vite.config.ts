import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Repo is deployed to GitHub Pages at https://<user>.github.io/ptv-train-map/,
// so all built asset URLs need the repo name as a base path in production.
//
// Tailwind is wired up via the classic PostCSS pipeline (postcss.config.js +
// tailwind.config.js), not the `@tailwindcss/vite` plugin — that plugin (and
// Tailwind v4 generally) depends on native Rust binaries (`@tailwindcss/oxide`,
// `lightningcss`) that fail to load in some locked-down Windows environments
// ("Module did not self-register", the same class of problem this repo's
// `rollup: npm:@rollup/wasm-node` override already works around elsewhere).
// Tailwind v3 + postcss + autoprefixer are pure JS, so they sidestep that
// entirely — see `tailwind.config.js` for the design tokens.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ptv-train-map/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
