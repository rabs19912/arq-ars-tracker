import { getSql } from "@/lib/db";
import { configurePush, sendPush, type StoredSubscription } from "@/lib/push";

export const ALERT_BOOK = "usdc_ars";
export const ALERT_SIDE = "bid";
export const MAX_ACTIVE_ALERTS = 10;

export type Alert = {
  id: number;
  client_id: string;
  book: string;
  side: string;
  target: string;
  direction: "above" | "below";
  created_at: Date | string;
  triggered_at: Date | string | null;
  triggered_value: string | null;
};

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

function formatArs(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? currency.format(n) : value;
}

/** Atomically claims the untriggered alerts reached by `bid` for `book`. */
async function claimAlerts(book: string, bid: string): Promise<Alert[]> {
  const sql = getSql();
  const rows = await sql`
    UPDATE alerts
    SET triggered_at = now(), triggered_value = ${bid}::numeric
    WHERE triggered_at IS NULL
      AND book = ${book}
      AND (
        (direction = 'above' AND target <= ${bid}::numeric)
        OR (direction = 'below' AND target >= ${bid}::numeric)
      )
    RETURNING id, client_id, book, side, target, direction, created_at, triggered_at, triggered_value`;
  return rows as Alert[];
}

async function notifyClient(alert: Alert, bid: string): Promise<void> {
  const sql = getSql();
  const subs = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE client_id = ${alert.client_id}`) as StoredSubscription[];
  const payload = {
    title: "Alerta USDC a ARS",
    body: `Llegó a ${formatArs(bid)} (objetivo ${formatArs(alert.target)})`,
    url: "/",
  };
  const results = await Promise.allSettled(subs.map((s) => sendPush(s, payload)));
  for (const [i, r] of results.entries()) {
    if (r.status === "rejected") {
      console.error("[alerts] push crashed:", r.reason);
    } else if (!r.value.ok) {
      if (r.value.gone) {
        await sql`DELETE FROM push_subscriptions WHERE endpoint = ${subs[i].endpoint}`;
      } else {
        console.error("[alerts] push failed:", r.value.error);
      }
    }
  }
}

/**
 * Evaluates alerts against the freshly saved quotes and sends pushes.
 * Never throws: failures are logged. Returns the number of triggered alerts.
 */
export async function processAlerts(
  saved: { book: string; bid: string }[],
): Promise<number> {
  try {
    const relevant = saved.filter((q) => q.book === ALERT_BOOK);
    if (relevant.length === 0) return 0;
    const pushReady = configurePush();
    if (!pushReady) {
      // Leave alerts active so they still fire once VAPID is configured.
      console.warn("[alerts] VAPID env is missing; skipping alert evaluation");
      return 0;
    }
    let total = 0;
    for (const q of relevant) {
      const triggered = await claimAlerts(q.book, q.bid);
      total += triggered.length;
      await Promise.allSettled(
        triggered.map((a) =>
          notifyClient(a, q.bid).catch((err) =>
            console.error("[alerts] notify failed:", err),
          ),
        ),
      );
    }
    return total;
  } catch (err) {
    console.error("[alerts] evaluation failed:", err);
    return 0;
  }
}
