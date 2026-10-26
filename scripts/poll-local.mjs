const URL_CRON = process.env.POLL_URL ?? "http://localhost:3000/api/cron";
const INTERVAL_MS = 30 * 60 * 1000;
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is not set (check .env.local)");
  process.exit(1);
}

async function poll() {
  const stamp = new Date().toISOString();
  try {
    const res = await fetch(URL_CRON, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log(`[${stamp}] HTTP ${res.status} ${body}`);
  } catch (err) {
    console.error(`[${stamp}] request failed:`, err instanceof Error ? err.message : err);
  }
}

await poll();
setInterval(poll, INTERVAL_MS);
console.log("Polling every 30 minutes. Press Ctrl+C to stop.");
