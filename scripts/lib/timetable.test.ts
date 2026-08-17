import assert from "node:assert/strict";
import {
  melbourneDateRange,
  parseGtfsTime,
  unionStationOrder,
  validateTimetable,
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
