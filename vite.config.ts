import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves production assets from the /ptv-train-map/ project path.
//
// Tailwind uses the PostCSS pipeline because Tailwind v4's native binaries can
// fail to load in locked-down Windows environments. Tailwind v3, PostCSS, and
// Autoprefixer avoid that native dependency.
// `isPreview` matters because preview runs as a "serve" command over an
// already-built dist: without it the served base is "/" while the built assets
// point at "/ptv-train-map/", so nothing resolves and the service worker in
// particular cannot be tested locally at all.
export default defineConfig(({ command, isPreview }) => ({
  // Vercel is the root. GitHub Pages still uses the project path.
  base: process.env.VERCEL ? "/" : command === "build" || isPreview ? "/ptv-train-map/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // public/manifest.webmanifest is hand-written and already linked from
      // index.html, so the plugin must not emit a competing one.
      manifest: false,
      workbox: {
        // Only the shell. The three files under data/ total 4.8MB and one of
        // them is rewritten every few minutes, so precaching them would make
        // every deploy a full re-download; runtimeCaching handles them below.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // The 192/512 icons are only ever read by the OS at install time, and
        // the two 512s are 227KB each — half a megabyte of precache for images
        // the page itself never renders.
        globIgnores: ["data/**", "icons/icon-*.png"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // NetworkFirst, not StaleWhileRevalidate: a departure time from the
            // cache is only worth showing when the network cannot supply a
            // newer one. Three seconds is about the point where waiting longer
            // is worse than showing aged times that the freshness dot labels.
            urlPattern: /\/data\/network-live\.json$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "wimt-live",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // The timetable and the station/geometry data change once a day at
            // most, and are large. Serving them from the cache makes a cold
            // start instant, and the background revalidation picks up the
            // overnight rebuild by the next launch.
            urlPattern: /\/data\/network-(static|timetable)\.json$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "wimt-schedule",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Off by default: a service worker in dev caches modules and makes
        // hot reloads lie about what is on disk.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
