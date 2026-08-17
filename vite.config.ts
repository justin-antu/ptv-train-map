import { defineConfig } from "vite";

// Repo is deployed to GitHub Pages at https://<user>.github.io/where-is-my-train/,
// so all built asset URLs need the repo name as a base path in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/where-is-my-train/" : "/",
}));
