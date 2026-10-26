import { NextResponse } from "next/server";
import { fetchTickers } from "@/lib/arq";
import {
  ALERT_BOOK,
  ALERT_SIDE,
  MAX_ACTIVE_ALERTS,
  type Alert,
} from "@/lib/alerts";
import { ensureClientId, readClientId } from "@/lib/client-id";
import { ensureSchema, getSql, isUndefinedTable } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
  try {
    const clientId = await readClientId();
    if (!clientId) return NextResponse.json({ ok: true, alerts: [] });
    const sql = getSql();
    const alerts = await sql`
      SELECT id, book, side, target, direction, created_at, triggered_at, triggered_value
      FROM alerts
      WHERE client_id = ${clientId}
      ORDER BY created_at DESC, id DESC
      LIMIT 20`;
    return NextResponse.json({ ok: true, alerts });
  } catch (err) {
    if (isUndefinedTable(err)) return NextResponse.json({ ok: true, alerts: [] });
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alerts] GET failed:", err);
    return fail(500, message);
  }
}

type ParsedSubscription = { endpoint: string; p256dh: string; auth: string };

function parseSubscription(value: unknown): ParsedSubscription | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { endpoint?: unknown; keys?: unknown };
  if (typeof v.endpoint !== "string") return null;
  try {
    if (new URL(v.endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (typeof v.keys !== "object" || v.keys === null) return null;
  const k = v.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof k.p256dh !== "string" || typeof k.auth !== "string") return null;
  if (!k.p256dh || !k.auth) return null;
  return { endpoint: v.endpoint, p256dh: k.p256dh, auth: k.auth };
}

function parseTarget(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n : null;
}

async function currentBid(): Promise<number | null> {
  try {
    const tickers = await fetchTickers();
    const t = tickers.find((x) => x.book === ALERT_BOOK);
    const n = t ? Number(t.bid) : NaN;
    if (Number.isFinite(n)) return n;
  } catch (err) {
    console.warn("[alerts] live Arq fetch failed, falling back to DB:", err);
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT bid FROM quotes WHERE book = ${ALERT_BOOK}
    ORDER BY saved_at DESC, id DESC LIMIT 1`) as { bid: string }[];
  const n = rows[0] ? Number(rows[0].bid) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, "El cuerpo de la solicitud no es JSON válido.");
    }
    const b = (typeof body === "object" && body !== null ? body : {}) as {
      target?: unknown;
      subscription?: unknown;
    };
    const target = parseTarget(b.target);
    if (target === null) {
      return fail(400, "El valor objetivo debe ser un número positivo.");
    }
    const subscription = parseSubscription(b.subscription);
    if (!subscription) {
      return fail(400, "La suscripción de notificaciones no es válida.");
    }

    const clientId = await ensureClientId();
    await ensureSchema();
    const sql = getSql();

    const bid = await currentBid();
    if (bid === null) {
      return fail(503, "No se pudo obtener la cotización actual. Intenta nuevamente.");
    }
    const direction = target >= bid ? "above" : "below";

    const active = (await sql`
      SELECT count(*)::int AS n FROM alerts
      WHERE client_id = ${clientId} AND triggered_at IS NULL`) as { n: number }[];
    if (active[0].n >= MAX_ACTIVE_ALERTS) {
      return fail(429, `Máximo ${MAX_ACTIVE_ALERTS} alertas activas. Elimina alguna para crear otra.`);
    }

    await sql`
      INSERT INTO push_subscriptions (client_id, endpoint, p256dh, auth)
      VALUES (${clientId}, ${subscription.endpoint}, ${subscription.p256dh}, ${subscription.auth})
      ON CONFLICT (endpoint) DO UPDATE
      SET client_id = EXCLUDED.client_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`;

    const rows = (await sql`
      INSERT INTO alerts (client_id, book, side, target, direction)
      VALUES (${clientId}, ${ALERT_BOOK}, ${ALERT_SIDE}, ${String(target)}::numeric, ${direction})
      RETURNING id, book, side, target, direction, created_at, triggered_at, triggered_value`) as Partial<Alert>[];
    return NextResponse.json({ ok: true, alert: rows[0], currentBid: bid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alerts] POST failed:", err);
    return fail(500, message);
  }
}
