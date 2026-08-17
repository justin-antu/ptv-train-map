// Ad-hoc verification script (not part of the shipped project) — deleted after use.
const CDP_PORT = 9333;
const APP_URL = "http://localhost:5183/";

async function newTab() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  return res.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", reject);
  });
}

function send(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e9);
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const tab = await newTab();
  const ws = await connect(tab.webSocketDebuggerUrl);
  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  // Clear localStorage BEFORE navigating meaningfully by navigating once, clearing, then reloading.
  await send(ws, "Page.navigate", { url: APP_URL });
  await new Promise((r) => setTimeout(r, 1500));
  await send(ws, "Runtime.evaluate", { expression: "localStorage.clear()" });
  await send(ws, "Page.navigate", { url: APP_URL });
  await new Promise((r) => setTimeout(r, 3000));

  const evalResult = await send(ws, "Runtime.evaluate", {
    expression: `
      JSON.stringify({
        title: document.title,
        h1: document.querySelector('h1')?.textContent,
        subtitle: document.querySelector('.subtitle')?.textContent,
        demoBadgeText: document.getElementById('demo-badge')?.textContent,
        demoBadgeVisible: document.getElementById('demo-badge')?.classList.contains('visible'),
        statusText: document.getElementById('status-text')?.textContent,
        checkedCount: document.querySelectorAll('.legend-item input[type=checkbox]:checked').length,
        totalCount: document.querySelectorAll('.legend-item input[type=checkbox]').length,
        localStorageVisibleLineIds: localStorage.getItem('wimt:visibleLineIds'),
      })
    `,
    returnByValue: true,
  });
  console.log("STATE:", evalResult.result.value);

  await send(ws, "Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
  const fs = await import("node:fs");
  fs.writeFileSync("C:/code/github/where-is-my-train/_verify-fresh.png", Buffer.from(shot.data, "base64"));

  // Click a station marker to test info card, then a train marker.
  await send(ws, "Runtime.evaluate", {
    expression: `
      (function() {
        const el = document.querySelector('#legend .legend-title');
        return el ? 'legend-found' : 'legend-missing';
      })()
    `,
  });

  await send(ws, "Browser.close");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
