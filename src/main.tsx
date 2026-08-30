import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Latin-only weights: IBM Plex Mono has no variable build, so each weight the
// UI uses is requested explicitly.
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import App from "./App";
import { installThemeTokens } from "./theme/applyThemeTokens";

// Publish design tokens before the first React render so components never
// paint against the stylesheet fallbacks.
installThemeTokens();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element missing");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
