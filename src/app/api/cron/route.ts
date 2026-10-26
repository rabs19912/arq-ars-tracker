import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fetchTickers, normalizeDate } from "@/lib/arq";
import { processAlerts } from "@/lib/alerts";
import { ensureSchema, getSql, type Quote } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const tickers = await fetchTickers();
    await ensureSchema();
    const sql = getSql();
    const saved: Quote[] = [];
    for (const t of tickers) {
      const rows = (await sql`
        INSERT INTO quotes (book, bid, ask, quote_date)
        VALUES (${t.book}, ${t.bid}, ${t.ask}, ${normalizeDate(t.date)})
        RETURNING id, book, bid, ask, quote_date, saved_at`) as Quote[];
      saved.push(rows[0]);
    }
    const alertsTriggered = await processAlerts(saved);
    return NextResponse.json({ ok: true, saved, alertsTriggered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
