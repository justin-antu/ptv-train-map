# Dude, where's my train?

A static React application for exploring Metro Trains Melbourne services through an estimated live train map and full daily line timetables. V/Line regional services are outside the project scope.

## Features

- Estimated train positions across all 16 Metro lines, animated along GTFS track geometry using PTV predicted departure times.
- Official PTV line colours, deduplicated station markers, line visibility controls, station search, and station or train detail cards.
- Delay indicators for predictions at least three minutes behind schedule.
- Inline PTV disruption alerts in the line controls and timetable panel.
- Full daily line timetables for eight Melbourne dates, including direction selection, branch variants, express-service gaps, overnight GTFS times, sticky identifiers, and horizontal scrolling.
- A favourite-station departure board stored in `localStorage`.
- Opt-in browser notifications for an approaching train. Permission is requested only from the notification toggle.
- Responsive React interface with a 20/60/20 desktop layout: controls on the left, map in the centre, and timetable on the right.
- Light theme by default with optional dark interface chrome. The map remains on the light CARTO Positron basemap in both themes.
- Tailwind CSS design tokens, self-hosted variable Geist and Geist Mono fonts, and local Magic UI-style components including the map Border Beam.
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

On desktop, the application uses a 20/60/20 controls-map-timetable grid. Smaller screens stack the map and panels. The map Border Beam is decorative and does not affect map interaction.

## Data semantics and limitations

- **Train positions are estimates, not GPS locations.** The PTV Timetable API supplies predicted station departure times rather than vehicle coordinates. Positions are interpolated in time and projected onto the route polyline between consecutive predicted stops.
- **Between-station movement is approximate.** Interpolation cannot represent unscheduled stops, speed changes, or delays occurring between stations.
- **Limited-stop services may cross skipped sections abruptly.** No predicted time exists for an omitted stop.
- **Each line uses one canonical alignment.** City Loop routing and other service variants may differ from the displayed track. Shared corridors are drawn as overlapping coloured lines rather than merged infrastructure.
- **Station identity is name-based.** Shared stations use one coordinate selected during static-data generation; platform-level differences are not represented.
- **Delay values are prediction-based.** A `+N min` value is the difference between a stop's scheduled and current predicted departure time.
- **Timetable cells are scheduled, not real-time.** PTV `run_ref` and GTFS `trip_id` are not guaranteed to provide a stable join, so live estimates are not merged into timetable cells.
- **Disruptions are associated with lines.** A line alert may not affect every station or service on that line.
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
- Interface fonts: [Geist](https://vercel.com/font), self-hosted through Fontsource packages.
