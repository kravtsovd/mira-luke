import { LibraryBurstGuard } from "../../lib/library-auth";
import { LibraryError } from "../../lib/library-input";
import { readSharedEnglishProgress, recordSharedEnglishRound } from "../../lib/game-progress-store";
import { DEFAULT_FAMILY, requestFamily } from "../../lib/auth";

export const runtime = "nodejs";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "no-store" };
const unavailable = () => Response.json({ error: "Не удалось связаться с сервером." }, { status: 503, headers });
// The English game exists only in Mira's profile.
const isEnglishProfile = (value: unknown): value is "mira" => value === "mira";

const forMiraFamily = (request: Request) => requestFamily(request) === DEFAULT_FAMILY;

export async function GET(request: Request) {
  if (!forMiraFamily(request)) return Response.json({ error: "Неизвестный профиль." }, { status: 404, headers });
  const profile = new URL(request.url).searchParams.get("profile");
  if (!isEnglishProfile(profile)) return Response.json({ error: "Неизвестный профиль." }, { status: 400, headers });
  try { return Response.json({ progress: await readSharedEnglishProgress(profile) }, { headers }); }
  catch { return unavailable(); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Откройте игру в приложении." }, { status: 403, headers });
  }
  if (!forMiraFamily(request)) return Response.json({ error: "Неизвестный профиль." }, { status: 404, headers });
  try {
    guard.check(request.headers.get("x-vercel-forwarded-for") ?? "local");
    const raw = await request.text();
    if (raw.length > 1024) throw new LibraryError("too_large", "Слишком большой запрос.", 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new LibraryError("invalid", "Некорректный раунд."); }
    const { profile, round } = body ?? {};
    if (!isEnglishProfile(profile) || !round || typeof round.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(round.id)
      || ![1, 2, 3, 4].includes(round.level) || typeof round.clean !== "boolean") {
      throw new LibraryError("invalid", "Некорректный раунд.");
    }
    return Response.json(await recordSharedEnglishRound(profile, { id: round.id, level: round.level, clean: round.clean }), { headers });
  } catch (error) {
    if (error instanceof LibraryError) return Response.json({ error: error.message }, { status: error.status, headers });
    return unavailable();
  }
}
