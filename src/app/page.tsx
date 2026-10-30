import AlertsPanel from "@/components/AlertsPanel";
import RefreshButton from "@/components/RefreshButton";
import { fetchTickers, type ArqTicker } from "@/lib/arq";
import { getLatestQuotes, isUndefinedTable, type Quote } from "@/lib/db";

export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Argentina/Buenos_Aires";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: TIME_ZONE,
});

type LoadResult = { quotes: Quote[]; message: string | null };

async function loadQuotes(): Promise<LoadResult> {
  try {
    const quotes = await getLatestQuotes(200);
    if (quotes.length === 0) {
      return {
        quotes,
        message: "Aún no hay cotizaciones guardadas. Aparecerán después de la primera ejecución del cron.",
      };
    }
    return { quotes, message: null };
  } catch (err) {
    if (isUndefinedTable(err)) {
      return {
        quotes: [],
        message: "La tabla todavía no existe. Ejecuta npm run db:init o espera la primera ejecución del cron.",
      };
    }
    console.error("[page] failed to load quotes:", err);
    const missingEnv = err instanceof Error && err.message.includes("DATABASE_URL");
    return {
      quotes: [],
      message: missingEnv
        ? "Falta configurar la variable DATABASE_URL."
        : "No se pudieron cargar las cotizaciones. Intenta nuevamente más tarde.",
    };
  }
}

/** Live quote for the cards; null when Arq is unreachable (cards fall back to the DB). */
async function loadLiveQuote(): Promise<ArqTicker | null> {
  try {
    const tickers = await fetchTickers();
    return tickers.find((t) => t.book === "usdc_ars") ?? null;
  } catch (err) {
    console.error("[page] failed to fetch live quote:", err);
    return null;
  }
}

function formatPrice(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? currency.format(n) : value;
}

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : dateTime.format(d);
}

function spreadPercent(ask: string, bid: string): string {
  const a = Number(ask);
  const b = Number(bid);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return "-";
  return `${(((a - b) / a) * 100).toFixed(2)} %`;
}

export default async function Home() {
  const [{ quotes, message }, live] = await Promise.all([loadQuotes(), loadLiveQuote()]);
  const latest = quotes[0];
  const savedUsdc = quotes.find((q) => q.book === "usdc_ars");
  const current = live ?? savedUsdc;
  const latestUsdcBid = current?.bid ?? null;
  const updatedAt = live ? dateTime.format(new Date()) : null;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;

  return (
    <main className="container">
      <header>
        <h1>Arq USDC/ARS Tracker</h1>
        <p className="subtitle">Cotización guardada cada 10 minutos desde Arq Finance.</p>
      </header>

      <div className="live-bar">
        <p className="live-status">
          {updatedAt
            ? `Cotización en vivo · ${updatedAt}`
            : "Sin conexión con Arq: se muestra el último valor guardado."}
        </p>
        <RefreshButton />
      </div>

      <section className="cards" aria-label="Última cotización">
        <article className="card">
          <h2>ARS a USDC</h2>
          <p className="value">{current ? formatPrice(current.ask) : "-"}</p>
        </article>
        <article className="card">
          <h2>USDC a ARS</h2>
          <p className="value">{current ? formatPrice(current.bid) : "-"}</p>
        </article>
        <article className="card">
          <h2>Último guardado</h2>
          <p className="value small">{latest ? formatDate(latest.saved_at) : "-"}</p>
        </article>
      </section>

      <AlertsPanel vapidPublicKey={vapidPublicKey} latestBid={latestUsdcBid} />

      {message ? <p className="notice">{message}</p> : null}

      {quotes.length > 0 ? (
        <section>
          <h2>Últimas {quotes.length} cotizaciones</h2>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Guardado</th>
                  <th>Par</th>
                  <th className="num">Ask</th>
                  <th className="num">Bid</th>
                  <th className="num">Spread %</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>{formatDate(q.saved_at)}</td>
                    <td>{q.book.toUpperCase().replace("_", "/")}</td>
                    <td className="num">{formatPrice(q.ask)}</td>
                    <td className="num">{formatPrice(q.bid)}</td>
                    <td className="num">{spreadPercent(q.ask, q.bid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
