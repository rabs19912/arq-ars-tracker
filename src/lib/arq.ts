export type ArqTicker = {
  ask: string;
  bid: string;
  book: string;
  date: string;
};

const ARQ_URL = "https://api.arqfinance.com/v1/tickers?currencies=ARS";

function isTicker(value: unknown): value is ArqTicker {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ask === "string" &&
    typeof v.bid === "string" &&
    typeof v.book === "string" &&
    typeof v.date === "string"
  );
}

/** The API returns UTC without timezone; append Z unless one is present. */
export function normalizeDate(date: string): string {
  return /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(date) ? date : `${date}Z`;
}

export async function fetchTickers(): Promise<ArqTicker[]> {
  const res = await fetch(ARQ_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Arq API responded with HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Unexpected Arq response: expected a non-empty array");
  }
  const invalid = data.findIndex((item) => !isTicker(item));
  if (invalid !== -1) {
    throw new Error(
      `Unexpected Arq response: element ${invalid} must have string ask, bid, book and date`,
    );
  }
  return data as ArqTicker[];
}
