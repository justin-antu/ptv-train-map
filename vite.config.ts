import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves production assets from the /ptv-train-map/ project path.
//
// Tailwind uses the PostCSS pipeline because Tailwind v4's native binaries can
// fail to load in locked-down Windows environments. Tailwind v3, PostCSS, and
// Autoprefixer avoid that native dependency.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ptv-train-map/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
