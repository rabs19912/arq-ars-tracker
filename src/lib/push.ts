import webpush from "web-push";

export type PushPayload = { title: string; body: string; url: string };

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let configured = false;

/** Lazy VAPID setup. Returns false (and never throws) when env is missing. */
export function configurePush(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; error: unknown };

/** Sends one push. `gone` is true when the endpoint is no longer valid (404/410). */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload,
): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return { ok: false, gone: status === 404 || status === 410, error };
  }
}
