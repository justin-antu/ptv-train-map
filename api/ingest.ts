import type { LiveSnapshot } from "../src/shared/types.ts";

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Accepts a live snapshot from the existing fetch script / Actions.
 * Hobby cron is daily-only, so a 2-minute refresh still posts here.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const expected = process.env.CRON_SECRET;
  if (!expected || header(req, "authorization") !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  const body = req.body as Partial<LiveSnapshot> | undefined;
  if (!body || !Array.isArray(body.runs) || typeof body.generatedAtUtc !== "string") {
    res.status(400).json({ error: "Invalid snapshot" });
    return;
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(501).json({ error: "BLOB_READ_WRITE_TOKEN is not configured" });
    return;
  }

  const put = await fetch("https://blob.vercel-storage.com/network-live.json", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!put.ok) {
    res.status(502).json({ error: "Blob write failed" });
    return;
  }

  res.status(200).json({ ok: true, generatedAtUtc: body.generatedAtUtc });
}
