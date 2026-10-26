import { NextResponse } from "next/server";
import { getLatestQuotes, isUndefinedTable } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

export async function GET(request: Request) {
  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));
  try {
    const quotes = await getLatestQuotes(limit);
    return NextResponse.json({ ok: true, count: quotes.length, quotes });
  } catch (err) {
    if (isUndefinedTable(err)) {
      return NextResponse.json({ ok: true, count: 0, quotes: [] });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[quotes] failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
