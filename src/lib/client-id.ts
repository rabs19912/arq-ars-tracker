import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export const CLIENT_COOKIE = "client_id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the cookie's client id only when it looks like a UUID. */
export async function readClientId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CLIENT_COOKIE)?.value;
  return value && UUID_RE.test(value) ? value : null;
}

/** Returns the existing client id or creates one and sets the cookie. */
export async function ensureClientId(): Promise<string> {
  const existing = await readClientId();
  if (existing) return existing;
  const id = randomUUID();
  const store = await cookies();
  store.set(CLIENT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
