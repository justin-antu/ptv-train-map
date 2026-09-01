type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

/** Stores a Web Push subscription. Requires BLOB_READ_WRITE_TOKEN when hosted. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Push store is not configured" });
    return;
  }
  if (!req.body || typeof req.body !== "object") {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }
  const put = await fetch(`https://blob.vercel-storage.com/push-${Date.now()}.json`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-content-type": "application/json",
    },
    body: JSON.stringify(req.body),
  });
  if (!put.ok) {
    res.status(502).json({ error: "Could not store subscription" });
    return;
  }
  res.status(200).json({ ok: true });
}
