# Dude, where's my train? 🚆 — Metro Trains Melbourne

A fun, near real-time map of **every Metro Trains Melbourne metropolitan line**
(V/Line regional trains are explicitly out of scope), built as a fully static
site (Vite + TypeScript + [MapLibre GL JS](https://maplibre.org/)) that can be
hosted for free on GitHub Pages — no backend server required.

Trains are shown moving smoothly along their line's actual track alignment,
interpolated between predicted departure times at each station, each line
drawn in its own official PTV colour, with a legend panel to show/hide
individual lines.

## Features

- **Live map** of all 16 lines, each in its own official PTV colour, with
  trains animated between stations and a collapsible legend to show/hide
  individual lines (your selection is remembered across visits).
- **Delay & disruption visibility** — trains running noticeably late (≥3 min
  versus their scheduled time) get a pulsing amber ring on the map and a
  "+N min" badge on their info card; any line with an active PTV service
  alert shows a small warning indicator next to its legend entry that expands
  to the alert text when clicked.
- **Station & train info cards** — click any station for its next few
  departures across every line that serves it, or click a train for its
  line, destination, and next stop. Only one card is ever open at a time.
- **Station search** — type a station name in the search box to fly the map
  straight to it (re-enabling its line(s) if they were hidden) and open its
  info card.
- **"My station" dashboard** — star any station from its info card to pin a
  small live departure board for it (persisted in `localStorage`), with an
  opt-in toggle for browser notifications when your next train is ~2 minutes
  away. Notifications are never requested automatically — only when you
  explicitly turn the toggle on.
- **Trip planner** — pick a "from" and "to" station to see the next few
  direct departures; if the two stations don't share a line, it falls back to
  a simple one-interchange heuristic (via Flinders Street where possible) or
  tells you plainly that no route was found in the current data. This is a
  deliberately simple v1 — see [Limitations](#limitations) for what it
  doesn't do.
- **Installable PWA** — add it to your phone's home screen for an app-like,
  full-screen experience (no offline support — it's inherently a live-data
  app).

## In-scope lines

All 16 current Metro lines: **Alamein, Belgrave, Craigieburn, Cranbourne,
Frankston, Glen Waverley, Hurstbridge, Lilydale, Mernda, Pakenham,
Sandringham, Stony Point, Sunbury, Upfield, Werribee, Williamstown.**

This list isn't hand-typed from memory — `scripts/lib/lines.ts` documents how
it was verified against the live PTV Timetable API (`/v3/routes?route_types=0`)
and cross-checked against the Victorian GTFS Schedule feed's Metropolitan
Train branch. **V/Line is never queried or included** (it uses a different
route_type in both data sources). See that file if PTV restructures the
network in future and this list needs re-verifying.

## How it works

```
┌──────────────────────┐      ┌──────────────────────────┐     ┌──────────────────────┐      
│ GitHub Actions cron  │────▶  public/data/*.json         ────▶  Static site (Pages) │
│ (refresh-data.yml)   │      │  - network-static.json   │     │  Vite + MapLibre     │
│ calls PTV Timetable  │      │    (16 lines' stations + │     │  interpolates every  │
│ API for all 16 lines,│      │    polylines + colours,  │     │  active train's      │
│ writes + commits     │      │    committed, rarely     │     │  position client-    │
│ a live snapshot      │      │    regenerated)          │     │  side every frame    │
│                      │      │  - network-live.json     │     │                      │
│                      │      │    (bot-committed every  │     │                      │
│                      │      │    few minutes)          │     │                      │
└──────────────────────┘      └──────────────────────────┘     └──────────────────────┘
```

1. **Static network data** (`public/data/network-static.json`) — every
   in-scope line's stations (name, lat/lon, order) and route polyline, plus
   its official PTV colour, extracted once from the official Victorian
   **GTFS Schedule** feed via `scripts/generate-static-data.ts`. Shared
   stations (e.g. Flinders Street, Richmond, Caulfield) are deduplicated into
   a single entry referenced by every line that serves them. This rarely
   changes, so it's committed to the repo instead of being fetched/processed
   at runtime (processing all 16 lines from the raw ~250MB GTFS feed still
   only takes a few seconds, since every GTFS file is streamed exactly once
   regardless of line count).
2. **Live data** (`public/data/network-live.json`) — predicted departure
   times (scheduled *and* estimated, so per-train delay can be computed) per
   station across all 16 lines (~300 line/station pairs), plus current
   service alerts per line, fetched from the **PTV Timetable API v3**
   (`/v3/departures` and `/v3/disruptions/route/{route_id}`) by
   `scripts/fetch-live-data.ts` (using bounded-concurrency requests — see
   `scripts/lib/concurrency.ts` — so a full network fetch takes well under a
   minute), run on a schedule by
   [`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml)
   and committed straight to `main`. This file does **not** exist until the
   first scheduled run (or a real key is configured) — see
   [Limitations](#limitations).
3. **The frontend** (`src/`) loads both files, draws every line + deduplicated
   station markers in each line's official PTV colour, renders a legend panel
   to show/hide individual lines, and animates a train icon per active
   service by interpolating its position along its own line's track polyline
   between the two stations bracketing the current time — recomputed every
   animation frame (a single shared loop across all lines/trains) and
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
  next, then geographically snapped onto its line's track polyline between
  those two stations. It'll be roughly right, but won't reflect real
  slow-downs, stops, or delays that happen *between* stations.
- **Assumes each run stops at every station in our list.** A handful of
  services occasionally run limited-stops/express — for those, the train may
  appear to "jump" across a skipped station rather than gliding through it,
  since we don't have a predicted time for the skipped stop.
- **Each line is modelled as a single canonical direct alignment.** Some real
  services run via the underground City Loop (Southern Cross / Flagstaff /
  Melbourne Central / Parliament) instead of a line's direct alignment — this
  matches how PTV's own network map represents each line (the loop is shared
  infrastructure used by many lines, not specific to any one of them), but it
  means a loop-routed train's on-map travel time through the loop portion of
  its trip will be a rough approximation. The Sunbury/Cranbourne/Pakenham
  lines are modelled via the newer Metro Tunnel corridor instead, since that's
  their real primary alignment post-tunnel (no separate "direct" alternative
  exists for them any more).
- **Shared corridors are drawn as overlapping lines, not merged.** Where
  multiple lines run the same physical track (the City Loop approaches, the
  Metro Tunnel trunk shared by Sunbury/Cranbourne/Pakenham, etc.), each line's
  colour is drawn as its own overlapping polyline rather than one
  cartographically "merged" line — a deliberate simplification for a fun
  infographic-style map, not aiming for pixel-perfect PTV map styling.
- **Station identity is by name.** Stations shared by multiple lines are
  deduplicated by (slugified) name into a single marker; the specific lat/lon
  used is whichever line's GTFS data was processed first, so it may be off by
  a platform's width in principle (not noticeable at map scale).
- **No live data until the first successful cron run** (needs the two repo
  secrets configured — see below). Until then, and any time the live fetch
  fails, the site falls back to a clearly-labelled **"Sample preview"** state
  and shows a couple of synthetic trains per line looping up and down each
  line, so it never shows a blank or broken page.
- **Upgrading to real GPS later**: if a GTFS-Realtime Vehicle Positions feed
  key becomes available for Melbourne trains in future, `scripts/fetch-live-data.ts`
  and `src/trains/interpolate.ts` are the two places that would need to change
  to consume real positions instead of interpolating between predicted times.
- **Delay figures come from the same predicted times, not GPS.** "+N min" is
  the gap between a stop's originally-scheduled time and PTV's current
  predicted time for it — it's only as accurate/timely as PTV's own
  prediction, same caveat as train positions above.
- **Trip planner is a simple v1, not full journey planning.** It only tries a
  direct (same-line) trip, then a single interchange (preferring Flinders
  Street, else whichever station covers the most lines) — never two or more
  changes. It also only ever looks at each station's already-fetched window
  of upcoming departures (see `MAX_RESULTS_PER_STOP` in
  `scripts/fetch-live-data.ts`), so during very low-frequency periods (e.g.
  the middle of the night, when some lines run no trains at all) it can
  genuinely find no viable connection even where one exists at a busier time
  — it reports "no route found" honestly in that case rather than guessing.
- **Disruption alerts are per-line, not per-stop.** A line-level PTV service
  alert doesn't necessarily affect every station on that line equally, but
  it's surfaced as a single legend indicator for the whole line for
  simplicity.

## Project structure

```
├── public/
│   ├── manifest.webmanifest    PWA manifest (name, theme colour, icons)
│   ├── icons/                  App/favicon icons referenced by index.html + the manifest
│   └── data/
│       ├── network-static.json    Committed: all 16 lines' stations + polylines + colours (from GTFS)
│       └── network-live.json      Bot-committed: live departures + per-line disruptions (created by CI)
├── scripts/
│   ├── lib/
│   │   ├── csv.ts             Minimal streaming CSV parser (for the large GTFS files)
│   │   ├── lines.ts           Authoritative in-scope line list (verified against live API + GTFS)
│   │   ├── concurrency.ts     Bounded-concurrency helper used when fetching ~300 departures per run
│   │   ├── ptvClient.ts       PTV Timetable API v3 HMAC-SHA1 signing + typed fetch helpers (departures + disruptions)
│   │   └── ptvClient.test.ts  Regression test for the signing algorithm (`npx tsx scripts/lib/ptvClient.test.ts`)
│   ├── generate-static-data.ts  Regenerates network-static.json from the GTFS feed (rarely needed)
│   └── fetch-live-data.ts       Fetches live departures + disruptions for all lines, writes network-live.json (run by CI on a schedule)
├── src/
│   ├── config.ts               Non-secret app config (data URLs, poll intervals)
│   ├── shared/types.ts         Shared TS types for the static/live JSON shapes
│   ├── data/
│   │   ├── departures.ts       Shared "upcoming departures at a station" + ETA-formatting helpers
│   │   └── tripPlanner.ts      Direct + one-interchange trip-planning logic
│   ├── map/
│   │   ├── map.ts              MapLibre setup: basemap, per-line route colours, deduplicated station markers
│   │   ├── legend.ts           Collapsible show/hide-per-line legend panel + disruption indicators
│   │   ├── infoCard.ts         Station/train click info cards (single-card-at-a-time)
│   │   ├── favourite.ts        "My station" departure board + opt-in notifications
│   │   ├── stationAutocomplete.ts  Reusable station search/autocomplete input (search box + trip planner)
│   │   └── tripPlannerPanel.ts     Trip planner UI
│   ├── trains/                 Per-line position + delay interpolation (along each line's polyline), marker rendering, shared animation loop
│   └── main.ts                 App entry point
└── .github/workflows/
    ├── refresh-data.yml        Scheduled: fetches live data + disruptions for all lines, commits public/data/network-live.json
    └── deploy.yml              Builds with Vite and deploys to GitHub Pages on push to main
```

## Local development

```bash
npm install
npm run dev
```

This starts Vite's dev server (prints a local URL, typically http://localhost:5173).
Without live data configured, the map will show a clearly-labelled **sample
preview** with synthetic trains (a couple per line) — that's expected and by design.

To test against the real PTV API locally:

```bash
cp .env.example .env
# edit .env with your real PTV_DEV_ID and PTV_API_KEY
npm run fetch:live-data   # writes public/data/network-live.json (all 16 lines)
npm run dev
```

Get your own PTV Timetable API key by registering at
<https://www.vic.gov.au/public-transport-timetable-api>.

Other useful scripts:

```bash
npm run build            # type-checks and builds the production site into dist/
npm run typecheck        # tsc --noEmit
npm run generate:static-data   # regenerate network-static.json from a local GTFS extract (see script header comment)
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
warning, and the deployed site will keep showing the sample-preview fallback.

## GitHub Pages deployment

`deploy.yml` publishes via GitHub's native Pages support (`actions/deploy-pages`),
which requires **Settings → Pages → Source: "GitHub Actions"** (a one-time
manual setting — GitHub doesn't currently expose a stable public API to set
this, so it isn't automatable from a script). Once set, every push to `main`
(including automated data-refresh commits, which also count as pushes) triggers
a fresh build + deploy.

The Vite base path is hard-coded to `/ptv-train-map/` for production builds
(see `vite.config.ts`) to match GitHub Pages' project-site URL structure. If you
fork this repo under a different name, update that base path to match.

## Data & attribution

- Station, route and colour data: [Victorian GTFS Schedule](https://opendata.transport.vic.gov.au/dataset/gtfs-schedule)
  (Department of Transport and Planning, CC BY 4.0) — each line's official PTV
  colour comes straight from its GTFS `route_color` field.
- Live departure predictions: [PTV Timetable API v3](https://www.vic.gov.au/public-transport-timetable-api).
- Basemap tiles: [CARTO](https://carto.com/attributions) Positron, © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- In-scope line list: verified against the live PTV Timetable API and the
  Victorian GTFS feed on 2026-08-17 — see `scripts/lib/lines.ts` for the full
  verification method and how to re-check it if PTV restructures the network.
