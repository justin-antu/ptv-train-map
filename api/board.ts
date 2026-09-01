import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LiveRun, LiveSnapshot } from "../src/shared/types.ts";

type VercelRequest = { query: Record<string, string | string[] | undefined> };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

function queryString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function slimRun(run: LiveRun, fromId: string, toId: string | null): LiveRun | null {
  const originIndex = run.stops.findIndex((stop) => stop.stationId === fromId && !stop.isSkipped);
  if (originIndex < 0) return null;
  if (toId) {
    const later = run.stops.slice(originIndex + 1).some((stop) => stop.stationId === toId && !stop.isSkipped);
    if (!later) return null;
  }
  return run;
}

async function loadSnapshot(): Promise<LiveSnapshot | null> {
  if (process.env.LIVE_SNAPSHOT_URL) {
    const response = await fetch(process.env.LIVE_SNAPSHOT_URL);
    if (!response.ok) return null;
    return (await response.json()) as LiveSnapshot;
  }
  try {
    const file = path.join(process.cwd(), "public/data/network-live.json");
    return JSON.parse(await readFile(file, "utf8")) as LiveSnapshot;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  const fromId = queryString(req.query.from);
  const toId = queryString(req.query.to);
  if (!fromId) {
    res.status(400).json({ error: "from is required" });
    return;
  }

  const snapshot = await loadSnapshot();
  if (!snapshot) {
    res.status(503).json({ error: "Live snapshot unavailable" });
    return;
  }

  const runs = snapshot.runs.filter((run) => slimRun(run, fromId, toId));
  res.status(200).json({
    generatedAtUtc: snapshot.generatedAtUtc,
    feedTimestampUtc: snapshot.feedTimestampUtc,
    isScheduleOnly: snapshot.isScheduleOnly === true,
    runs,
    disruptionsByLine: snapshot.disruptionsByLine ?? {},
  });
}
