import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}

const sql = neon(url);

// Keep this DDL identical to ensureSchema() in src/lib/db.ts
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

console.log("Tables quotes, push_subscriptions, alerts and indexes are ready.");
