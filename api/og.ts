type VercelRequest = { query: Record<string, string | string[] | undefined> };
type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  send: (body: string) => void;
};

function q(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/** Station-board share image. SVG so nothing extra has to be installed. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const mins = escape(q(req.query.mins, "7"));
  const dest = escape(q(req.query.to, "Flinders Street"));
  const from = escape(q(req.query.from, "Box Hill"));
  const plat = escape(q(req.query.plat, ""));
  const line = escape(q(req.query.line, "Lilydale"));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f4f1ea"/>
  <rect x="0" y="0" width="28" height="630" fill="#152C6B"/>
  <text x="80" y="90" font-family="ui-monospace, monospace" font-size="22" fill="#6b6256" letter-spacing="4">WHERE'S MY TRAIN?</text>
  <text x="80" y="280" font-family="Georgia, serif" font-size="180" fill="#16120c">${mins}</text>
  <text x="420" y="260" font-family="ui-monospace, monospace" font-size="28" fill="#6b6256">MIN</text>
  <text x="80" y="400" font-family="Georgia, serif" font-size="56" fill="#16120c">${dest}</text>
  <text x="80" y="470" font-family="ui-monospace, monospace" font-size="24" fill="#3d3830">${from}  ·  ${line}${plat ? `  ·  PLAT ${plat}` : ""}</text>
  <text x="80" y="560" font-family="ui-monospace, monospace" font-size="18" fill="#6b6256">Dude, where's my train?  ·  Metro Trains Melbourne</text>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(svg);
}
