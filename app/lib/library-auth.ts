import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { LibraryError } from "./library-input";

const MAX_AGE = 2 * 60 * 60;
function sign(value: string) {
  const secret = process.env.LIBRARY_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new LibraryError("library_not_configured", "Добавление пока недоступно. Попробуй позже.", 503);
  return createHmac("sha256", secret).update(`search-video:${value}`).digest("hex");
}

// Search tickets only admit IDs returned by our search. They are not user authentication or a spending cap.
export function createLibraryTicket(videoId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${expiry}.${sign(`${videoId}:${expiry}`)}`;
}

export function authorizeLibrary(request: Request, videoId: string, ticket: unknown): void {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LibraryError("forbidden_origin", "Открой приложение и попробуй снова.", 403);
  }
  sign("");
  const [expiry, signature, extra] = typeof ticket === "string" ? ticket.split(".") : [];
  const now = Math.floor(Date.now() / 1000);
  if (!expiry || !/^\d{10}$/.test(expiry) || Number(expiry) <= now || Number(expiry) > now + MAX_AGE || extra !== undefined || !signature || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(`${videoId}:${expiry}`), "hex"))) {
    throw new LibraryError("search_expired", "Обнови поиск и попробуй добавить видео ещё раз.", 403);
  }
}

// Per-instance burst protection bounds memory and request bursts. Provider caps must enforce monetary budgets across instances.
export class LibraryBurstGuard {
  private clients = new Map<string, number>();
  private until = 0;
  private total = 0;
  check(client: string, now = Date.now()) {
    if (now >= this.until) { this.clients.clear(); this.total = 0; this.until = now + 60_000; }
    const count = this.clients.get(client) ?? 0;
    if (count >= 12 || this.total >= 60) throw new LibraryError("rate_limited", "Немного подожди и попробуй ещё раз через минуту.", 429);
    this.clients.set(client, count + 1);
    this.total += 1;
  }
}
export const libraryBurstGuard = new LibraryBurstGuard();
