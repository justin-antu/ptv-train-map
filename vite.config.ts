import { defineConfig } from "vite";

// Repo is deployed to GitHub Pages at https://<user>.github.io/ptv-train-map/,
// so all built asset URLs need the repo name as a base path in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ptv-train-map/" : "/",
}));
