"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type AlertItem = {
  id: number;
  target: string;
  direction: "above" | "below";
  triggered_at: string | null;
  triggered_value: string | null;
};

type Props = {
  vapidPublicKey: string | null;
  latestBid: string | null;
};

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
});

const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function formatArs(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? currency.format(n) : value;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Feedback = { kind: "ok" | "error"; text: string } | null;

export default function AlertsPanel({ vapidPublicKey, latestBid }: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(latestBid ? String(Number(latestBid)) : "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setAlerts(data.alerts as AlertItem[]);
    } catch {
      // The list is a convenience; keep the previous one on failure.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAlerts();
  }, [loadAlerts]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vapidPublicKey) return;
    setFeedback(null);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setFeedback({
        kind: "error",
        text: "Este navegador no soporta notificaciones push. En iPhone, instala la app en la pantalla de inicio.",
      });
      return;
    }
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setFeedback({
          kind: "error",
          text: "Permiso de notificaciones denegado. Habilítalo en la configuración del navegador para este sitio.",
        });
        return;
      }
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: Number(target),
          subscription: subscription.toJSON(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback({ kind: "error", text: data.error ?? "No se pudo crear la alerta." });
        return;
      }
      setFeedback({ kind: "ok", text: "Alerta programada." });
      setOpen(false);
      await loadAlerts();
    } catch (err) {
      console.error("[alerts] failed to create alert:", err);
      setFeedback({
        kind: "error",
        text: "No se pudo crear la alerta. Intenta nuevamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedback({ kind: "error", text: data.error ?? "No se pudo eliminar la alerta." });
        return;
      }
    } catch {
      setFeedback({ kind: "error", text: "No se pudo eliminar la alerta." });
      return;
    }
    await loadAlerts();
  }

  return (
    <section className="alerts" aria-label="Alertas de precio">
      <div className="alerts-header">
        <h2>Alertas</h2>
        <button
          type="button"
          className="btn"
          disabled={!vapidPublicKey}
          onClick={() => setOpen((v) => !v)}
        >
          Programar alerta
        </button>
      </div>

      {!vapidPublicKey ? (
        <p className="notice">
          Las alertas no están disponibles: faltan las claves VAPID en el servidor.
        </p>
      ) : null}

      {open && vapidPublicKey ? (
        <form className="alert-form" onSubmit={onSubmit}>
          <label htmlFor="alert-target">Avisarme cuando USDC a ARS llegue a</label>
          <div className="alert-form-row">
            <input
              id="alert-target"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Guardando..." : "Guardar alerta"}
            </button>
          </div>
        </form>
      ) : null}

      {feedback ? (
        <p className={feedback.kind === "ok" ? "feedback ok" : "feedback error"} role="status">
          {feedback.text}
        </p>
      ) : null}

      {alerts.length > 0 ? (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id}>
              <div>
                <strong>
                  USDC a ARS {a.direction === "above" ? "sube a" : "baja a"} {formatArs(a.target)}
                </strong>
                <div className="alert-status">
                  {a.triggered_at
                    ? `Disparada el ${dateTime.format(new Date(a.triggered_at))}${
                        a.triggered_value ? ` a ${formatArs(a.triggered_value)}` : ""
                      }`
                    : "Activa"}
                </div>
              </div>
              <button type="button" className="btn" onClick={() => onDelete(a.id)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
