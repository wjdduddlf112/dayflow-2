import type { Env } from "./types";
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const base64 = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)));
export async function digest(s: string) {
  return base64(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  );
}
export async function verifyPassword(password: string, stored: string) {
  const [rounds, salt, hash] = stored.split(":");
  const n = Number(rounds);
  if (!n || n < 100000 || n > 1000000 || !salt || !hash) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const actual = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations: n },
      key,
      256,
    ),
  );
  const expected = bytes(hash);
  if (actual.length !== expected.length) return false;
  return actual.reduce((v, c, i) => v | (c ^ expected[i]), 0) === 0;
}
export async function authenticated(req: Request, env: Env) {
  if (env.APP_ENV === "development") return true;
  if (!env.AUTH_PASSWORD_HASH || !env.SESSION_SECRET) return false;
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)dayflow_session=([^;]+)/)?.[1];
  if (!token) return false;
  return !!(await env.DB.prepare(
    "SELECT id FROM Sessions WHERE id=? AND expires_at>?",
  )
    .bind(await digest(token + env.SESSION_SECRET), Date.now())
    .first());
}
export const cookie = (token: string, maxAge = 604800) =>
  `dayflow_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
