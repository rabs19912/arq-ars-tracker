import { neon } from "@neondatabase/serverless";

export type Quote = {
  id: number;
  book: string;
  bid: string;
  ask: string;
  quote_date: Date | string;
  saved_at: Date | string;
};

type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;
let schemaReady: Promise<void> | null = null;

/** Lazy client: only fails when a query is actually needed. */
export function getSql(): Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  client = neon(url);
  return client;
}

/** Creates the tables and indexes if missing. Memoized per process. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS quotes (
          id SERIAL PRIMARY KEY,
          book TEXT NOT NULL,
          bid NUMERIC(20,10) NOT NULL,
          ask NUMERIC(20,10) NOT NULL,
          quote_date TIMESTAMPTZ NOT NULL,
          saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS quotes_saved_at_idx ON quotes (saved_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id SERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS push_subscriptions_client_id_idx ON push_subscriptions (client_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          client_id TEXT NOT NULL,
          book TEXT NOT NULL DEFAULT 'usdc_ars',
          side TEXT NOT NULL DEFAULT 'bid',
          target NUMERIC(20,10) NOT NULL,
          direction TEXT NOT NULL CHECK (direction IN ('above','below')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          triggered_at TIMESTAMPTZ,
          triggered_value NUMERIC(20,10)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS alerts_client_id_idx ON alerts (client_id)`;
      await sql`CREATE INDEX IF NOT EXISTS alerts_book_active_idx ON alerts (book) WHERE triggered_at IS NULL`;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** True when the error is Postgres "undefined_table" (42P01). */
export function isUndefinedTable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "42P01"
  );
}

export async function getLatestQuotes(limit: number): Promise<Quote[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, book, bid, ask, quote_date, saved_at
    FROM quotes
    ORDER BY saved_at DESC, id DESC
    LIMIT ${limit}`;
  return rows as Quote[];
}
