type VercelRequest = { headers: Record<string, string | string[] | undefined> };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

/**
 * Daily watchdog on Hobby (native cron is daily-only). A 2-minute refresh
 * should POST /api/ingest from Actions or an external cron instead.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const ingest = process.env.INGEST_URL;
  const secret = process.env.CRON_SECRET;
  if (!ingest || !secret) {
    res.status(501).json({
      error: "Watchdog only. Point a 2-minute cron or GitHub Action at POST /api/ingest.",
    });
    return;
  }
  res.status(200).json({ ok: true, hint: "Run scripts/fetch-live-data.ts and POST the snapshot to /api/ingest." });
}
