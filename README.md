# Where Is My Train? 🚆 — Lilydale Line

A fun, real-time(ish) map of Metro Trains Melbourne's **Lilydale line**, built as a
fully static site (Vite + TypeScript + [MapLibre GL JS](https://maplibre.org/)) that
can be hosted for free on GitHub Pages — no backend server required.

Trains are shown moving smoothly along the actual track alignment, interpolated
between predicted departure times at each station.

## How it works

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌────────────────────┐
│ GitHub Actions cron  │────▶│ public/data/*.json        │────▶│ Static site (Pages) │
│ (refresh-data.yml)   │     │  - lilydale-static.json   │     │  Vite + MapLibre     │
│ calls PTV Timetable  │     │    (stations + polyline,  │     │  interpolates train  │
│ API, writes + commits│     │    committed, rarely      │     │  positions client-   │
│ a live snapshot      │     │    regenerated)           │     │  side every frame    │
│                      │     │  - lilydale-live.json     │     │                      │
│                      │     │    (bot-committed every   │     │                      │
│                      │     │    few minutes)           │     │                      │
└─────────────────────┘     └──────────────────────────┘     └────────────────────┘
```

1. **Static line data** (`public/data/lilydale-static.json`) — the 23 Lilydale
   stations (name, lat/lon, order) and the route polyline (761 points tracing the
   actual track), extracted once from the official Victorian **GTFS Schedule**
   feed via `scripts/generate-static-data.ts`. This rarely changes, so it's
   committed to the repo instead of being fetched at runtime.
2. **Live data** (`public/data/lilydale-live.json`) — predicted departure times
   per station, fetched from the **PTV Timetable API v3** by
   `scripts/fetch-live-data.ts`, which is run on a schedule by
   [`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) and
   committed straight to `main`. This file does **not** exist until the first
   scheduled run (or a real key is configured) — see [Limitations](#limitations).
3. **The frontend** (`src/`) loads both files, draws the line + station markers in
   the official PTV Lilydale colour, and animates a train icon per active service
   by interpolating its position along the track polyline between the two
   stations bracketing the current time, recomputed every animation frame and
   re-synced whenever a fresh live snapshot is polled (every 30s).
4. **Deployment** — [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
   builds the Vite app and publishes it to GitHub Pages on every push to `main`
   (including the automated data-refresh commits).

## Limitations (please read!)

- **This is not real GPS.** The PTV Timetable API v3 key (`devId` + signing key)
  only exposes **predicted departure times** per station, not raw vehicle GPS
  positions (that's a GTFS-Realtime-only capability). So a train's position on
  the map is an **estimate**, linearly interpolated in time between its
  predicted departure from one station and its predicted departure from the
  next, then geographically snapped onto the track polyline between those two
  stations. It'll be roughly right, but won't reflect real slow-downs, stops, or
  delays that happen *between* stations.
- **Assumes each run stops at every station in our list.** A handful of
  Lilydale services occasionally run limited-stops/express — for those, the
  train may appear to "jump" across a skipped station rather than gliding
  through it, since we don't have a predicted time for the skipped stop.
- **The Lilydale line is modelled as the direct alignment only** (Flinders
  Street ↔ Richmond ↔ … ↔ Lilydale, 23 stations). Some real Lilydale services
  run via the underground City Loop (Southern Cross / Flagstaff / Melbourne
  Central / Parliament) instead — this matches how PTV's own network map
  represents the line (the City Loop is shared infrastructure used by many
  lines, not Lilydale-specific), but it means a loop-routed train's on-map
  travel time between Flinders Street and Richmond will be a rough
  approximation during the loop portion of its trip.
- **No live data until the first successful cron run** (needs the two repo
  secrets configured — see below). Until then, and any time the live fetch
  fails, the site clearly labels itself **"DEMO DATA"** and shows a handful of
  synthetic trains looping up and down the line, so it never shows a blank or
  broken page.
- **Upgrading to real GPS later**: if a GTFS-Realtime Vehicle Positions feed
  key becomes available for Melbourne trains in future, `scripts/fetch-live-data.ts`
  and `src/trains/interpolate.ts` are the two places that would need to change
  to consume real positions instead of interpolating between predicted times.

## Project structure

```
├── public/data/
│   ├── lilydale-static.json   Committed: stations + route polyline (from GTFS)
│   └── lilydale-live.json     Bot-committed: live departure snapshot (gitignored locally, created by CI)
├── scripts/
│   ├── lib/
│   │   ├── csv.ts             Minimal streaming CSV parser (for the large GTFS files)
│   │   ├── ptvClient.ts       PTV Timetable API v3 HMAC-SHA1 signing + typed fetch helpers
│   │   └── ptvClient.test.ts  Regression test for the signing algorithm (`npx tsx scripts/lib/ptvClient.test.ts`)
│   ├── generate-static-data.ts  Regenerates lilydale-static.json from the GTFS feed (rarely needed)
│   └── fetch-live-data.ts       Fetches live departures, writes lilydale-live.json (run by CI on a schedule)
├── src/
│   ├── config.ts               Non-secret app config (line colour, data URLs, poll intervals)
│   ├── shared/types.ts         Shared TS types for the static/live JSON shapes
│   ├── data/                   Loading live/static data + client-side demo data generator
│   ├── map/map.ts               MapLibre setup: basemap, route line, station markers/labels
│   ├── trains/                  Position interpolation (along the polyline), marker rendering, animation loop
│   └── main.ts                 App entry point
└── .github/workflows/
    ├── refresh-data.yml        Scheduled: fetches live data, commits public/data/lilydale-live.json
    └── deploy.yml              Builds with Vite and deploys to GitHub Pages on push to main
```

## Local development

```bash
npm install
npm run dev
```

This starts Vite's dev server (prints a local URL, typically http://localhost:5173).
Without live data configured, the map will show clearly-labeled **demo/sample
trains** — that's expected and by design.

To test against the real PTV API locally:

```bash
cp .env.example .env
# edit .env with your real PTV_DEV_ID and PTV_API_KEY
npm run fetch:live-data   # writes public/data/lilydale-live.json
npm run dev
```

Get your own PTV Timetable API key by registering at
<https://www.vic.gov.au/public-transport-timetable-api>.

Other useful scripts:

```bash
npm run build            # type-checks and builds the production site into dist/
npm run typecheck        # tsc --noEmit
npm run generate:static-data   # regenerate lilydale-static.json from a local GTFS extract (see script header comment)
```

## GitHub repo secrets (required for live data)

For the scheduled workflow to fetch real live departures, add two
**repository secrets** (Settings → Secrets and variables → Actions → New
repository secret):

| Secret name    | Value                                             |
| -------------- | -------------------------------------------------- |
| `PTV_DEV_ID`   | Your PTV Timetable API developer ID (small integer) |
| `PTV_API_KEY`  | Your PTV Timetable API signing key (GUID-like)      |

Until these are set, `refresh-data.yml` will run but skip the fetch with a
warning, and the deployed site will keep showing demo data.

## GitHub Pages deployment

`deploy.yml` publishes via GitHub's native Pages support (`actions/deploy-pages`),
which requires **Settings → Pages → Source: "GitHub Actions"** (a one-time
manual setting — GitHub doesn't currently expose a stable public API to set
this, so it isn't automatable from a script). Once set, every push to `main`
(including automated data-refresh commits, which also count as pushes) triggers
a fresh build + deploy.

The Vite base path is hard-coded to `/where-is-my-train/` for production builds
(see `vite.config.ts`) to match GitHub Pages' project-site URL structure. If you
fork this repo under a different name, update that base path to match.

## Data & attribution

- Station and route data: [Victorian GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule)
  (Department of Transport and Planning, CC BY 4.0).
- Live departure predictions: [PTV Timetable API v3](https://www.vic.gov.au/public-transport-timetable-api).
- Basemap tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Line colour (`#152C6B`, the Burnley group navy blue): PTV's published Metro
  Service Guidelines colour palette, cross-checked against the Victorian GTFS
  feed's own `route_color` field for the Lilydale route and against the
  colour tables used by several community PTV visualisation projects.
