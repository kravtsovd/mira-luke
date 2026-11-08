import "server-only";
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export const DEFAULT_FAMILY = "demo";
export const SESSION_COOKIE = "ml_session";
export const OAUTH_COOKIE = "ml_oauth";
const SESSION_DAYS = 180;

export interface Session { email: string; familyId: string; name?: string; exp: number }

function secret() {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SESSION_SECRET is not configured");
  return value;
}
const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const mac = (payload: string) => createHmac("sha256", secret()).update(`ml-session:${payload}`).digest();

export function signValue(value: object): string {
  const payload = b64(JSON.stringify(value));
  return `${payload}.${b64(mac(payload))}`;
}
export function verifyValue<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    const expected = mac(payload);
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch { return null; }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function cookie(name: string, value: string, request: Request, maxAgeSeconds: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function getSession(request: Request): Session | null {
  try {
    const session = verifyValue<Session>(readCookie(request, SESSION_COOKIE));
    if (!session || typeof session.email !== "string" || typeof session.familyId !== "string" || !(session.exp > Date.now() / 1000)) return null;
    return session;
  } catch { return null; }
}

export function newSession(email: string, familyId: string, name?: string): Session {
  return { email, familyId, ...(name ? { name: name.slice(0, 80) } : {}), exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
}
export const sessionCookie = (session: Session, request: Request) => cookie(SESSION_COOKIE, signValue(session), request, SESSION_DAYS * 86400);
export const clearSessionCookie = (request: Request) => cookie(SESSION_COOKIE, "", request, 0);

/** The family whose children this request may read and change. */
export function requestFamily(request: Request): string | null {
  const session = getSession(request);
  if (session) return session.familyId;
  return null;
}

export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

// --- Google OAuth (authorization code + PKCE) ---
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export const callbackUrl = (request: Request) => new URL("/api/auth/google/callback", new URL(request.url).origin).toString();

export function newOAuthState(returnTo: string) {
  const state = b64(randomBytes(24));
  const verifier = b64(randomBytes(48));
  const challenge = b64(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge, returnTo };
}

/** Only same-site relative paths survive the round trip through Google. */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value.slice(0, 300) : "/";
}

export interface GoogleIdentity { email: string; name?: string }

export async function exchangeGoogleCode(code: string, verifier: string, request: Request): Promise<GoogleIdentity> {
  const config = googleConfig();
  if (!config) throw new Error("Google sign-in is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: callbackUrl(request), grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const { id_token: idToken } = await response.json() as { id_token?: string };
  // The ID token arrives directly from Google's token endpoint over TLS, so its claims are trusted
  // without a signature check (OpenID Connect Core 3.1.3.7); issuer, audience and expiry are still checked.
  const [, payload] = (idToken ?? "").split(".");
  const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  if (!["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss)) || claims.aud !== config.clientId
    || !(Number(claims.exp) > Date.now() / 1000) || claims.email_verified !== true || typeof claims.email !== "string") {
    throw new Error("Google identity rejected");
  }
  return { email: claims.email.toLowerCase(), ...(typeof claims.name === "string" ? { name: claims.name } : {}) };
}
