import assert from "node:assert/strict";
import {
  canonicalizeGtfsStops,
  canonicalStopSequence,
  melbourneDateRange,
  parseGtfsTime,
  selectCanonicalStopTimes,
  unionStationOrder,
  validateTimetable,
  type GtfsStopRecord,
  type RawStopTime,
} from "./timetable.ts";
import type { NetworkTimetableData } from "../../src/shared/types.ts";

const dates = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];

// Stable branch union: common trunk stays ordered and branch-only cells can be null.
assert.deepEqual(
  unionStationOrder([
    ["city", "junction", "branch-a", "terminus-a"],
    ["city", "junction", "branch-b", "terminus-b"],
  ]),
  ["city", "junction", "branch-a", "branch-b", "terminus-a", "terminus-b"],
);

// Opposite directions are independently ordered, not reversed after unioning.
assert.deepEqual(unionStationOrder([["c", "b", "a"]]), ["c", "b", "a"]);

const gtfsStops: GtfsStopRecord[] = [
  {
    id: "vic:rail:FSS",
    name: "Flinders Street Railway Station",
    lat: -37.8183,
    lon: 144.967,
    locationType: "1",
    parentStation: "",
  },
  {
    id: "11212",
    name: "Flinders Street Station",
    lat: -37.81809,
    lon: 144.96627,
    locationType: "",
    parentStation: "vic:rail:FSS",
  },
  {
    id: "12203",
    name: "Flinders Street Station",
    lat: -37.81876,
    lon: 144.96674,
    locationType: "",
    parentStation: "vic:rail:FSS",
  },
  {
    id: "22238",
    name: "Flinders Street Station",
    lat: -37.81831,
    lon: 144.96696,
    locationType: "",
    parentStation: "vic:rail:FSS",
  },
  {
    id: "near-platform-1",
    name: "Example Station",
    lat: -37.8,
    lon: 144.9,
    locationType: "",
    parentStation: "",
  },
  {
    id: "near-platform-2",
    name: "Example Railway Station",
    lat: -37.8002,
    lon: 144.9002,
    locationType: "",
    parentStation: "",
  },
  {
    id: "distant-same-name",
    name: "Example Station",
    lat: -38.8,
    lon: 145.9,
    locationType: "",
    parentStation: "",
  },
];
const canonical = canonicalizeGtfsStops(gtfsStops);

// Declared GTFS platforms and the station parent produce one stable column.
assert.equal(canonical.get("11212")?.key, canonical.get("vic:rail:FSS")?.key);
assert.equal(canonical.get("12203")?.key, canonical.get("22238")?.key);
assert.equal(canonical.get("11212")?.id, "flinders-street");
assert.equal(canonical.get("11212")?.name, "Flinders Street");

// Parent-less platforms can use the guarded name/coordinate fallback, while a
// genuinely distinct station with the same display name remains separate.
assert.equal(canonical.get("near-platform-1")?.key, canonical.get("near-platform-2")?.key);
assert.notEqual(canonical.get("near-platform-1")?.key, canonical.get("distant-same-name")?.key);
assert.notEqual(canonical.get("near-platform-1")?.id, canonical.get("distant-same-name")?.id);

const rawStops: RawStopTime[] = [
  { stopId: "11212", sequence: 4, minutes: 501 },
  { stopId: "12203", sequence: 5, minutes: 503 },
  { stopId: "22238", sequence: 6, minutes: 504 },
];
const flindersKey = canonical.get("11212")!.key;

// Multiple raw Flinders variants collapse to one station visit and one cell.
assert.deepEqual(canonicalStopSequence(rawStops, canonical), [flindersKey]);
assert.deepEqual([...selectCanonicalStopTimes(rawStops, canonical)], [[flindersKey, 501]]);

// Canonicalization happens before branch union, preserving branch-aware order.
const cityKey = canonical.get("near-platform-1")!.key;
const branchA = canonical.get("11212")!.key;
const branchB = canonical.get("distant-same-name")!.key;
const orderedBranches = [branchA, branchB].sort();
assert.deepEqual(
  unionStationOrder([
    ["trunk", cityKey, branchA, "terminus-a"],
    ["trunk", cityKey, branchB, "terminus-b"],
  ]),
  ["trunk", cityKey, ...orderedBranches, "terminus-a", "terminus-b"],
);

// GTFS permits service-day times beyond 24:00 for trips crossing midnight.
assert.equal(parseGtfsTime("25:17:30"), 1517.5);
assert.throws(() => parseGtfsTime("not-a-time"), /Invalid GTFS time/);

// Melbourne date selection is DST-correct at the UTC instant where the local
// calendar has already moved to the next day.
assert.deepEqual(
  melbourneDateRange(2, new Date("2026-10-03T14:30:00Z")),
  ["2026-10-04", "2026-10-05"],
);

const fixture: NetworkTimetableData = {
  schemaVersion: 1,
  generatedAtUtc: "2026-10-03T14:30:00Z",
  timezone: "Australia/Melbourne",
  availableDates: dates,
  source: {
    schedule: "Victorian GTFS Schedule",
    ptvRouteMetadata: "not-verified",
    ptvVerifiedAtUtc: null,
    partial: true,
    warnings: ["synthetic partial fixture"],
  },
  lines: [{
    id: "test",
    name: "Test",
    color: "#000000",
    directions: [{
      id: "0",
      label: "Towards B",
      stationIds: ["a", "branch", "b"],
      stationNames: ["A", "Branch", "B"],
      services: [{
          id: "overnight",
          origin: "A",
          destination: "B",
          dateMask: 1,
          times: [1438, null, 1517.5],
        }],
    }],
  }],
};

// Empty dates and partial artifacts are valid; missing/skip-stop cells remain explicit.
assert.doesNotThrow(() => validateTimetable(fixture));
assert.equal(fixture.lines[0].directions[0].services[0].times[1], null);

// A total failure must be rejected before it can replace the last good artifact.
assert.throws(() => validateTimetable({ ...fixture, lines: [] }), /no lines/i);
assert.throws(
  () => validateTimetable({
    ...fixture,
    lines: [{
      ...fixture.lines[0],
      directions: [{
        ...fixture.lines[0].directions[0],
        services: [{
            ...fixture.lines[0].directions[0].services[0],
            times: [10],
          }],
      }],
    }],
  }),
  /column mismatch/i,
);

console.log("Timetable transformation verification passed");
