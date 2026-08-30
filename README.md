# Dude, where's my train?

A static, mobile-first React application for Metro Trains Melbourne commuters. It answers "when is my next train?" first, then offers an estimated live train map, full daily line timetables, and current service alerts. V/Line regional services are outside the project scope.

## Features

- A commute board built around two saved stations, **To city** and **From city**, with the leg matching the time of day selected by default.
- A live departures table for the selected commute station showing scheduled time, destination, remaining stops, line, delay status, and expected arrival.
- Service alerts for the commuter's own lines surfaced directly on the commute board, plus a full severity-grouped disruption feed.
- Estimated train positions across all 16 Metro lines, animated along GTFS track geometry using PTV predicted departure times.
- Favourite lines that filter departures, alerts, and the map at once. Leaving them unset shows the whole network.
- Full daily line timetables for eight Melbourne dates, including direction selection, branch variants, express-service gaps, overnight GTFS times, sticky identifiers, and horizontal scrolling.
- Delay indicators for predictions at least three minutes behind schedule, and a data-freshness readout that warns when the live snapshot goes stale.
- Opt-in browser notifications for an approaching train. Permission is requested only from the notification switch in commute settings.
- Bottom tab navigation on phones and a single scrolling page on desktop, both driven by the same four sections. Pull to refresh re-polls live data on mobile.
- All preferences — stations, lines, notifications, and theme — are stored in `localStorage`. There are no accounts.
- Light theme by default with optional dark interface chrome. The map remains on the light CARTO Positron basemap in both themes.
- A single theme configuration file drives every interface colour, exposed as Tailwind design tokens. Self-hosted IBM Plex Mono throughout, and local Magic UI-style components including the map Border Beam.
- Installable PWA presentation. Offline operation is not supported because the application depends on refreshed service data.

## In-scope lines

The application includes Alamein, Belgrave, Craigieburn, Cranbourne, Frankston, Glen Waverley, Hurstbridge, Lilydale, Mernda, Pakenham, Sandringham, Stony Point, Sunbury, Upfield, Werribee, and Williamstown.

The list is validated against the PTV Timetable API `/v3/routes?route_types=0` response and cross-checked against the Metropolitan Train branch of the Victorian GTFS Schedule feed. Exact route-name matching excludes V/Line, replacement buses, City Circle, and Flemington Racecourse services.

## Architecture and data sources

The Vite frontend is a fully static React and TypeScript site. GitHub Actions refresh committed JSON artifacts, and GitHub Pages serves the built application without an application backend.

### Static network data

`public/data/network-static.json` contains the 16 lines, official colours, canonical station sequences, station coordinates, and route polylines. `scripts/generate-static-data.ts` creates the artifact from the Victorian GTFS Schedule feed.

Shared stations are deduplicated by normalized name. Each line uses a canonical primary alignment; legacy City Loop variants are excluded when a direct alignment exists, while the Metro Tunnel corridor remains the primary alignment for the Sunbury, Cranbourne, and Pakenham lines.

### Daily timetable data

`public/data/network-timetable.json` contains complete scheduled service matrices for eight Melbourne calendar dates. `scripts/generate-timetable.ts` derives trip patterns, service calendars, branch variants, stop times, and times beyond 24:00 from GTFS.

When PTV credentials are available, one PTV `/routes` request validates the in-scope route names. Complete timetable generation remains GTFS-based because PTV requires a separate stopping-pattern request for each run.

The `refresh-timetable.yml` workflow downloads the official feed daily, runs timetable validation, generates the artifact, and replaces it atomically only after successful generation.

### Live snapshot data

`public/data/network-live.json` contains scheduled and estimated departure times plus current line disruptions. `scripts/fetch-live-data.ts` uses bounded-concurrency requests to the PTV Timetable API endpoints for routes, stops, departures, and disruptions.

The `refresh-data.yml` workflow runs every five minutes and performs three sub-fetches approximately 80 seconds apart. Each changed snapshot is committed. An explicit deployment dispatch follows changed data because pushes made with the workflow `GITHUB_TOKEN` do not trigger other push workflows.

The frontend polls the committed live snapshot every 30 seconds and recomputes train positions in a shared animation loop.

### Frontend

The interface is implemented with React 19, TypeScript, Tailwind CSS, Radix UI primitives, Motion, local Magic UI-style components, and MapLibre GL JS. The map uses keyless CARTO Positron raster tiles and does not change style when the interface theme changes.

Content is organised into four sections — Commute, Network, Timetable, and Alerts — in commuter priority order. Phones show one section at a time behind a bottom tab bar; desktop renders all four as a single scrolling page whose navigation highlight follows the section in view. The active section is mirrored into the URL fragment, so `#alerts` can be shared or bookmarked. On mobile a section stays mounted once opened, which means MapLibre is never created for a commuter who only checks departures, and is not rebuilt when they return to the map.

Every interface colour comes from `src/theme/defaultTheme.ts`. `installThemeTokens` publishes that definition as a stylesheet containing a `:root` and a `.dark` block, so switching themes remains a single class toggle and the values in `src/index.css` act only as first-paint fallbacks. The map Border Beam is decorative and does not affect map interaction.

## Data semantics and limitations

- **Train positions are estimates, not GPS locations.** The PTV Timetable API supplies predicted station departure times rather than vehicle coordinates. Positions are interpolated in time and projected onto the route polyline between consecutive predicted stops.
- **Between-station movement is approximate.** Interpolation cannot represent unscheduled stops, speed changes, or delays occurring between stations.
- **Limited-stop services may cross skipped sections abruptly.** No predicted time exists for an omitted stop.
- **Each line uses one canonical alignment.** City Loop routing and other service variants may differ from the displayed track. Shared corridors are drawn as overlapping coloured lines rather than merged infrastructure.
- **Station identity is name-based.** Shared stations use one coordinate selected during static-data generation; platform-level differences are not represented.
- **Delay values are prediction-based.** A `+N min` value is the difference between a stop's scheduled and current predicted departure time.
- **Timetable cells are scheduled, not real-time.** PTV `run_ref` and GTFS `trip_id` are not guaranteed to provide a stable join, so live estimates are not merged into timetable cells.
- **Disruptions are associated with lines.** A line alert may not affect every station or service on that line. Severity is inferred from PTV's free-text type and title because the feed carries no severity field.
- **Platform numbers are unavailable.** The live snapshot records predicted departure times only, so the departures table cannot show a platform.
- **Trip planning is not implemented.** The Plan a trip controls are a layout placeholder and do not search journeys.
- **Live data requires configured credentials and a successful refresh.** When no live artifact is available, or a refresh fails, the interface uses a labelled sample preview with synthetic trains.
- **The PWA does not provide offline service data.**

## Project structure

```text
├── public/
│   ├── data/
│   │   ├── network-static.json
│   │   ├── network-timetable.json
│   │   └── network-live.json
│   ├── icons/
│   └── manifest.webmanifest
├── scripts/
│   ├── lib/
│   │   ├── concurrency.ts
│   │   ├── csv.ts
│   │   ├── lines.ts
│   │   ├── ptvClient.ts
│   │   └── timetable.ts
│   ├── fetch-live-data.ts
│   ├── generate-static-data.ts
│   └── generate-timetable.ts
├── src/
│   ├── components/
│   ├── data/
│   ├── hooks/
│   ├── map/
│   ├── shared/
│   ├── theme/
│   ├── trains/
│   ├── App.tsx
│   ├── config.ts
│   ├── index.css
│   └── main.tsx
└── .github/workflows/
    ├── deploy.yml
    ├── refresh-data.yml
    └── refresh-timetable.yml
```

Generated JSON data and dependency lockfiles are not intended for manual editing.

## Local development

Install dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

The server prints the local URL, normally `http://localhost:5173`. Without a live snapshot, the interface displays the labelled sample preview.

### PTV credentials

Register for PTV Timetable API access at <https://www.vic.gov.au/public-transport-timetable-api>.

Copy the environment template and set the local credentials:

```bash
cp .env.example .env
```

Set:

- `PTV_DEV_ID`: PTV Timetable API developer ID.
- `PTV_API_KEY`: PTV Timetable API signing key.

Do not commit `.env`.

Fetch a local live snapshot and start the application:

```bash
npm run fetch:live-data
npm run dev
```

### Scripts

```bash
npm run dev                    # Start the Vite development server
npm run build                  # Type-check and build into dist/
npm run preview                # Preview the production build
npm run typecheck              # Run TypeScript without emitting files
npm run fetch:live-data        # Refresh public/data/network-live.json
npm run generate:static-data   # Regenerate static network data from GTFS_DIR
npm run generate:timetable     # Generate eight Melbourne dates from GTFS_DIR
```

`GTFS_DIR` defaults to `gtfs-download/metro-train`. Static and timetable generation require the extracted Metropolitan Train GTFS files.

## GitHub Actions configuration

Add `PTV_DEV_ID` and `PTV_API_KEY` as repository Actions secrets. The live refresh workflow skips API fetching when either secret is absent. Timetable generation still uses GTFS and reports PTV route validation as unavailable.

Configure GitHub Pages with **Settings → Pages → Source → GitHub Actions**.

`deploy.yml` builds and publishes on pushes to `main` and on explicit dispatch. The production Vite base path is `/ptv-train-map/`; deployments under another repository name require a matching update in `vite.config.ts`.

## Attribution

- Station, route, timetable, and colour data: [Victorian GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule), Department of Transport and Planning, licensed under CC BY 4.0.
- Predicted departures and disruptions: [PTV Timetable API v3](https://www.vic.gov.au/public-transport-timetable-api).
- Basemap: [CARTO Positron](https://carto.com/attributions), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Interface font: [IBM Plex Mono](https://github.com/IBM/plex), self-hosted through Fontsource packages.
