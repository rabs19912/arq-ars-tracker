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

console.log("Table quotes and index are ready.");
