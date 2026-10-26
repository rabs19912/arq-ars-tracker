import { NextResponse } from "next/server";
import { readClientId } from "@/lib/client-id";
import { getSql, isUndefinedTable } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = /^\d{1,9}$/.test(rawId) ? Number(rawId) : null;
    const clientId = await readClientId();
    if (id === null || !clientId) {
      return NextResponse.json({ ok: false, error: "Alerta no encontrada." }, { status: 404 });
    }
    const sql = getSql();
    const rows = (await sql`
      DELETE FROM alerts WHERE id = ${id} AND client_id = ${clientId} RETURNING id`) as { id: number }[];
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Alerta no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isUndefinedTable(err)) {
      return NextResponse.json({ ok: false, error: "Alerta no encontrada." }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alerts] DELETE failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
