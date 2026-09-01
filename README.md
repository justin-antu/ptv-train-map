# Dude, where's my train?

A static, mobile-first React application for Metro Trains Melbourne commuters. It answers "when is my next train?" first, then offers an estimated live train map, full daily line timetables, and current service alerts. V/Line regional services are outside the project scope.

## Features

- A live departures board showing the next four services from the saved station, expandable to twelve. Each row carries the countdown, the scheduled time as its permanent identity, the expected time beside it as a status, the platform, the line name, and a described stopping pattern.
- Departing station is the board's scope; destination and line are filters over it, reflected into the URL as `?from=&to=&line=` so a filtered board can be shared.
- Cancelled services stay on the board, marked in red with the word "Cancelled", stripped of platform and delay detail, and pointing at the next service on the same line.
- Every row states whether its times are real-time or timetable-only, so predictions and schedule are never silently mixed.
- Major disruptions surface on the board itself; the full alert feed is split into "affecting travel now" and "upcoming", filtered by line and severity.
- Train positions across all 16 Metro lines use GTFS-Realtime vehicle coordinates where the feed supplies them, falling back to interpolation along GTFS track geometry. The two are drawn differently.
- The chosen line filters departures, alerts, the timetable, and the map at once, from a single control in the header. Leaving it unset shows the whole network.
- Full daily line timetables for eight Melbourne dates, station-first by default with hour grouping, a "now" marker and a persistent jump-to-now. The full service-by-station grid is a desktop toggle.
- Timetable services are clustered by stopping pattern, not only by direction, so named variants such as "via City Loop" can be selected directly.
- Delay indicators for predictions at least three minutes behind schedule, and a data-freshness ladder that degrades to labelled scheduled times rather than going blank.
- Opt-in browser notifications for an approaching train, while the application is open. Permission is requested only from the bell control on the departures board.
- Every section is a collapsible card whose state persists, and navigation expands a collapsed target before scrolling to it.
- Bottom tab navigation on phones and a single scrolling page on desktop, both driven by the same four sections. Pull to refresh re-polls live data on mobile.
- All preferences — stations, lines, notifications, and theme — are stored in `localStorage`. There are no accounts.
- Light theme by default with optional dark interface chrome. The map remains on the light CARTO Positron basemap in both themes.
- A single theme configuration file drives every interface colour, exposed as Tailwind design tokens. Self-hosted IBM Plex Mono throughout, and local Magic UI-style components including the map Border Beam.
- Installable PWA with offline support. A service worker precaches the application shell and caches the three data artifacts, so the last known departures open with no reception and are labelled by the same freshness ladder.

## In-scope lines

The application includes Alamein, Belgrave, Craigieburn, Cranbourne, Frankston, Glen Waverley, Hurstbridge, Lilydale, Mernda, Pakenham, Sandringham, Stony Point, Sunbury, Upfield, Werribee, and Williamstown.

The list is validated against the PTV Timetable API `/v3/routes?route_types=0` response and cross-checked against the Metropolitan Train branch of the Victorian GTFS Schedule feed. Exact route-name matching excludes V/Line, replacement buses, City Circle, and Flemington Racecourse services.

## Architecture and data sources

The Vite frontend is a fully static React and TypeScript site. GitHub Actions refresh committed JSON artifacts, and GitHub Pages serves the built application without an application backend.

### Static network data

`public/data/network-static.json` contains the 16 lines, official colours, canonical station sequences, station coordinates, and route polylines. `scripts/generate-static-data.ts` creates the artifact from the Victorian GTFS Schedule feed.

Shared stations are deduplicated by normalized name, and platform-level GTFS stop ids are carried through as `gtfsStops` so the realtime feed's stop entries resolve to a station and a platform.

Station sets and route geometry are derived separately. A line's `stationIds` is the union of every trip on the route, which is why Flagstaff, Melbourne Central and Parliament exist; its `polyline` still comes from one canonical direct alignment, so the map draws a single legible track per line. Stations that sit off that alignment are marked `offCanonicalAlignment`. The Metro Tunnel corridor remains the canonical alignment for the Sunbury, Cranbourne, and Pakenham lines.

### Daily timetable data

`public/data/network-timetable.json` contains complete scheduled service matrices for eight Melbourne calendar dates. `scripts/generate-timetable.ts` derives trip patterns, service calendars, branch variants, stop times, and times beyond 24:00 from GTFS.

Scheduled platforms travel alongside the times, but indirectly. Canonicalisation folds every platform-level GTFS stop back into one station, which is right for a timetable column and wrong for a rider on the concourse, so each direction also carries a `platformSets` table of distinct platform rows and each service stores an index into it. Platform assignment varies far less than timing — 12,259 services resolve to 566 distinct rows — so sharing them costs a quarter of the megabyte that a per-service copy would.

When PTV credentials are available, one PTV `/routes` request validates the in-scope route names. Complete timetable generation remains GTFS-based because PTV requires a separate stopping-pattern request for each run.

The `refresh-timetable.yml` workflow downloads the official feed daily, runs timetable validation, generates the artifact, and replaces it atomically only after successful generation.

### Live snapshot data

`public/data/network-live.json` contains scheduled and estimated departure times, per-service status, vehicle positions where published, and current line disruptions.

`scripts/fetch-live-data.ts` layers the Victorian GTFS-Realtime feeds over the timetable this repository already ships. Three requests — trip updates, vehicle positions, and one PTV `/v3/disruptions?route_types=0` call — replace the roughly 300 per-station PTV polls the previous implementation needed to reconstruct trips. Trip identity, stopping pattern and destination come from the timetable; the realtime feed supplies only deltas, which is what makes per-service cancellations, real coordinates and platform numbers available at all.

Each realtime `trip_id` is resolved through the calendar active on its `start_date`, with a fallback across sibling ids that differ only in the version segment. Measured against a weekday peak feed, every timetabled trip matches exactly and the fallback is insurance rather than load-bearing. The remaining unmatched trips are all `ADDED` services, which have no timetable entry by definition and are excluded from the staleness canary so it can still signal genuine drift.

The script falls back to a schedule-only snapshot when the feed is unreachable.

The `refresh-data.yml` workflow fetches and commits every four minutes, and an explicit deployment dispatch follows each changed snapshot because pushes made with the workflow `GITHUB_TOKEN` do not trigger other push workflows.

It does this as a loop of fourteen iterations within a single run, which then dispatches its successor, rather than on a frequent cron. GitHub treats scheduled workflows as best effort and drops high-frequency ones under load: a `*/5` schedule was in practice honoured in short bursts a few times a day, with two- to six-hour gaps in between, so an 8am departures board was routinely reading a snapshot taken before midnight. The hourly `schedule` that remains is only a watchdog to restart a broken chain, `concurrency` holds the group to one running and one pending run so the chain cannot multiply, and `timeout-minutes` bounds a wedged run.

The frontend polls the committed live snapshot every 30 seconds and recomputes train positions in a shared animation loop. Polling pauses while the page is hidden and fetches immediately on return, and a failed poll leaves the previous snapshot in place rather than blanking the board.

### Frontend

The interface is implemented with React 19, TypeScript, Tailwind CSS, Radix UI primitives, Motion, local Magic UI-style components, and MapLibre GL JS. The map uses CARTO Positron raster tiles, keyed by `VITE_CARTO_BASEMAP_KEY`, and does not change style when the interface theme changes.

Content is organised into four sections — Departures, Network, Timetable, and Alerts — in commuter priority order. Phones show one section at a time behind a bottom tab bar; desktop renders all four as a single scrolling page whose navigation highlight follows the section in view. The active section is mirrored into the URL fragment, so `#alerts` can be shared or bookmarked. On mobile a section stays mounted once opened, which means MapLibre is never created for a commuter who only checks departures, and is not rebuilt when they return to the map. The Network section is also a lazy chunk, so that commuter downloads 162KB rather than 388KB compressed; the service worker precaches the map chunk in the background afterwards, so it still works offline.

Every interface colour comes from `src/theme/defaultTheme.ts`. `installThemeTokens` publishes that definition as a stylesheet containing a `:root` and a `.dark` block, so switching themes remains a single class toggle and the values in `src/index.css` act only as first-paint fallbacks. The map Border Beam is decorative and does not affect map interaction.

## Data semantics and limitations

- **Some train positions are estimates rather than GPS locations.** Where the GTFS-Realtime vehicle-positions feed publishes coordinates for a run, the marker is the reported position. Otherwise it is interpolated in time and projected onto the route polyline between consecutive predicted stops. Interpolated markers are drawn with a dashed outline and labelled as estimated.
- **Between-station movement is approximate when interpolated.** Interpolation cannot represent unscheduled stops, speed changes, or delays occurring between stations.
- **Limited-stop services may cross skipped sections abruptly.** No predicted time exists for an omitted stop.
- **Each line is drawn on one canonical alignment.** City Loop and other service variants are present as stations but may differ from the displayed track. Shared corridors are drawn as overlapping coloured lines rather than merged infrastructure.
- **Station identity is name-based.** Shared stations use one coordinate selected during static-data generation.
- **Delay values are prediction-based.** A `+N min` value is the difference between a stop's scheduled and current predicted departure time. A stop with no published prediction shows no delay rather than assuming it is on time.
- **Timetable cells are scheduled, not real-time.** A departure row links to its service in the timetable, but live estimates are not merged into timetable cells.
- **Disruptions are associated with lines.** A line alert may not affect every station or service on that line. Severity comes from PTV's own `display_on_board` flag and severity colour rather than from the wording of the title. Notices that PTV publishes once per affected line are merged into a single incident.
- **Platform numbers are scheduled unless the realtime feed says otherwise.** The timetable carries the GTFS `platform_code` for every call, and a realtime stop entry overrides it when one is published, because a late platform change is exactly what that feed exists to report. Trip updates only cover a slice of each trip, so before the schedule was carried through, a suburban board showed a platform on as few as one row in four; it is now about 98% of upcoming calls. The rest are services added on the day, which have no scheduled platform to fall back on.
- **Delay is carried forward across gaps in the realtime feed.** Metro publishes a partial slice of each trip, with holes in the middle of the slice on about half of them. The last known delay is carried until an explicit entry supersedes it, and those calls are flagged `isPropagated` so the interface can present them as estimates rather than first-hand predictions. A skipped call does not propagate.
- **Services added on the day are reconstructed from the realtime feed alone.** They have no timetable entry, so their advertised time is treated as their scheduled time and no delay is reported against them.
- **Trip planning is not implemented.** The destination field filters departures; it does not search journeys, interchanges, or other modes.
- **Live data requires configured credentials and a successful refresh.** When no live artifact is available, the interface falls back to genuine scheduled times from the shipped timetable, clearly labelled as timetable-only. No synthetic services are ever displayed.
- **Offline data is the last data this device downloaded.** The service worker serves `network-live.json` network-first with a three-second timeout, and the static and timetable artifacts stale-while-revalidate. With no reception the board still renders, but its times are as old as the last successful fetch and are labelled accordingly.
- **Arrival notifications only fire while the application is open.** The check is a foreground timer, which browsers throttle in a background tab and stop on a locked phone. Real background alerts need a push service holding subscriptions, which a static site has no way to provide.

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
│   │   ├── gtfsRealtime.ts
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

The server prints the local URL, normally `http://localhost:5173`. Without a live snapshot, the interface falls back to the shipped scheduled timetable, labelled as timetable-only.

### Credentials

Register for GTFS-Realtime access at <https://opendata.transport.vic.gov.au> and for PTV Timetable API access at <https://www.vic.gov.au/public-transport-timetable-api>.

Copy the environment template and set the local credentials:

```bash
cp .env.example .env
```

Set:

- `VIC_GTFS_R_KEY`: Victorian GTFS-Realtime key, sent as the `KeyID` request header. This is the source of live departures, cancellations and vehicle positions.
- `PTV_DEV_ID`: PTV Timetable API developer ID. Now used only for disruptions and route-name validation.
- `PTV_API_KEY`: PTV Timetable API signing key.
- `VITE_CARTO_BASEMAP_KEY`: CARTO basemap key, free from <https://carto.com/basemaps/apikey>. CARTO watermarks raster tiles requested without one. Unlike the other credentials, the `VITE_` prefix means this value is inlined into the browser bundle and is public by design; CARTO issues it against a nominated domain.

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

Add `VIC_GTFS_R_KEY`, `PTV_DEV_ID`, `PTV_API_KEY` and `VITE_CARTO_BASEMAP_KEY` as repository Actions secrets.

`VIC_GTFS_R_KEY` and `VITE_CARTO_BASEMAP_KEY` are both required, and their workflows fail loudly when either is empty. A keyless refresh would publish a valid-looking snapshot carrying timetable times and no real-time layer at all, and a keyless build would silently ship watermarked tiles; in both cases the failure is otherwise invisible until someone notices the result. Without the PTV pair the refresh omits disruptions, and timetable generation reports PTV route validation as unavailable.

Configure GitHub Pages with **Settings → Pages → Source → GitHub Actions**.

`deploy.yml` builds and publishes on pushes to `main` and on explicit dispatch. The production Vite base path is `/ptv-train-map/`; deployments under another repository name require a matching update in `vite.config.ts`.

## Attribution

- Station, route, timetable, and colour data: [Victorian GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule), Department of Transport and Planning, licensed under CC BY 4.0.
- Real-time departures, cancellations and vehicle positions: [Victorian GTFS-Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime), Department of Transport and Planning, licensed under CC BY 4.0.
- Service disruptions: [PTV Timetable API v3](https://www.vic.gov.au/public-transport-timetable-api).
- Basemap: [CARTO Positron](https://carto.com/attributions), © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Interface font: [IBM Plex Mono](https://github.com/IBM/plex), self-hosted through Fontsource packages.
