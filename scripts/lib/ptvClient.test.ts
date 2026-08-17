/**
 * Lightweight regression test for the PTV signing algorithm — no test runner
 * dependency, just plain assertions. Run with: `npx tsx scripts/lib/ptvClient.test.ts`.
 *
 * Since PTV's own documented worked example is internally broken (see the
 * comment in ptvClient.ts), we validate against:
 *   1) A second, independently-written implementation of the same documented
 *      algorithm (mirroring github.com/bremor/public_transport_victoria and the
 *      commonly shared "ptv_signature.py" gist), and
 *   2) Fixed hard-coded fixtures, so any future accidental change to the
 *      signing logic in ptvClient.ts is caught.
 */
import { createHmac } from "node:crypto";
import { signPtvRequest, type PtvCredentials } from "./ptvClient.ts";

function referenceSign(pathAndQuery: string, credentials: PtvCredentials): string {
  const withDevId = pathAndQuery + (pathAndQuery.includes("?") ? "&" : "?") + `devid=${credentials.devId}`;
  const digest = createHmac("sha1", String(credentials.apiKey)).update(withDevId).digest("hex").toUpperCase();
  return `${withDevId}&signature=${digest}`;
}

const cases: { path: string; credentials: PtvCredentials }[] = [
  { path: "/v3/routes?route_types=0", credentials: { devId: 1000000, apiKey: "mykey" } },
  {
    path: "/v3/departures/route_type/0/stop/1071/route/6",
    credentials: { devId: 2, apiKey: "9c132d31-6a30-4cac-8d8b-8a1970834799" },
  },
  { path: "/v3/healthcheck", credentials: { devId: 4, apiKey: "some-secret-guid-key" } },
];

let failures = 0;

for (const { path, credentials } of cases) {
  const actual = signPtvRequest(path, credentials);
  const expected = referenceSign(path, credentials);
  if (actual !== expected) {
    failures++;
    console.error(`FAIL for path=${path}\n  actual:   ${actual}\n  expected: ${expected}`);
  } else {
    console.log(`OK   ${path} -> ${actual}`);
  }
}

// Hard fixture: locks in the exact current output so silent regressions are caught.
const fixturePath = "/v3/routes?route_types=0";
const fixtureCredentials: PtvCredentials = { devId: 1000000, apiKey: "mykey" };
const fixtureExpected =
  "/v3/routes?route_types=0&devid=1000000&signature=09A512FC3E8DCB5A76D920AD5A249C8A84708BAF";
const fixtureActual = signPtvRequest(fixturePath, fixtureCredentials);
if (fixtureActual !== fixtureExpected) {
  failures++;
  console.error(`FAIL fixture\n  actual:   ${fixtureActual}\n  expected: ${fixtureExpected}`);
} else {
  console.log(`OK   fixture -> ${fixtureActual}`);
}

if (failures > 0) {
  console.error(`\n${failures} signing test(s) failed.`);
  process.exit(1);
}
console.log("\nAll PTV signing tests passed.");
