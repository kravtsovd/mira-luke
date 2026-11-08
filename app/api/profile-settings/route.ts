import { LibraryBurstGuard } from "../../lib/library-auth";
import { LibraryError } from "../../lib/library-input";
import { availableGames, isBuiltinProfile, isProfileId, ProfileKind } from "../../lib/profiles";
import { AppSettings, INTERVAL_OPTIONS, isMenuLayout } from "../../lib/settings";
import { readChild, readSharedSettings, writeSharedSettings } from "../../lib/profile-settings-store";
import { DEFAULT_FAMILY, requestFamily } from "../../lib/auth";
import { isToddlerCarGame } from "../../lib/toddler-cars";
import { isLukeTapGame } from "../../lib/luke-tap-games";
import { CAR_PUZZLE_GAME } from "../../lib/car-puzzle";

export const runtime = "nodejs";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "no-store", Vary: "X-Game-Schema" };
const unavailable = () => Response.json({ error: "Не удалось связаться с сервером. Попробуйте сохранить ещё раз." }, { status: 503, headers });

const signInRequired = () => Response.json({ error: "Войдите, чтобы открыть профили семьи.", code: "sign_in" }, { status: 401, headers });

async function readableSettings(request: Request | undefined, familyId: string) {
  const rows = await readSharedSettings(familyId);
  if (request?.headers.get("X-Game-Schema") === "2") return rows;
  return rows.map(row => {
    const enabledGames = row.settings.enabledGames.filter(game => !isToddlerCarGame(game) && !isLukeTapGame(game) && game !== CAR_PUZZLE_GAME);
    return { ...row, settings: { ...row.settings, enabledGames, learningEnabled: row.settings.learningEnabled && enabledGames.length > 0 } };
  });
}

export async function GET(request?: Request) {
  const familyId = request ? requestFamily(request) : DEFAULT_FAMILY;
  if (!familyId) return signInRequired();
  try { return Response.json({ profiles: await readableSettings(request, familyId) }, { headers }); }
  catch { return unavailable(); }
}

export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Откройте настройки в приложении." }, { status: 403, headers });
  }
  if (request.headers.get("X-Game-Schema") !== "2") {
    return Response.json({ error: "Обновите страницу перед сохранением настроек." }, { status: 409, headers });
  }
  const familyId = requestFamily(request);
  if (!familyId) return signInRequired();
  try {
    guard.check(request.headers.get("x-vercel-forwarded-for") ?? "local");
    const reader = request.body?.getReader();
    if (!reader) throw new LibraryError("invalid", "Пустой запрос.");
    const decoder = new TextDecoder();
    let raw = "", size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) { await reader.cancel(); throw new LibraryError("too_large", "Слишком большой запрос.", 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(raw); } catch { throw new LibraryError("invalid", "Некорректные настройки."); }
    const { profile, settings, revision } = body ?? {};
    if (!isProfileId(profile) || !Number.isSafeInteger(revision) || revision < 1 || revision >= Number.MAX_SAFE_INTEGER ||
      !settings || !isMenuLayout(settings.menuLayout) || typeof settings.learningEnabled !== "boolean" ||
      typeof settings.soundEnabled !== "boolean" || !INTERVAL_OPTIONS.includes(settings.intervalMinutes) ||
      !Array.isArray(settings.enabledGames) || settings.enabledGames.length < 1 ||
      new Set(settings.enabledGames).size !== settings.enabledGames.length) {
      throw new LibraryError("invalid", "Некорректные настройки.");
    }

    let kind: ProfileKind | undefined;
    if (isBuiltinProfile(profile) && familyId !== DEFAULT_FAMILY) throw new LibraryError("missing", "Этого ребёнка нет в вашей семье. Обновите страницу.", 404);
    if (!isBuiltinProfile(profile)) {
      const child = await readChild(profile, familyId);
      if (!child) throw new LibraryError("missing", "Этого ребёнка уже удалили. Обновите страницу.", 404);
      kind = child.kind;
    }
    const allowed = availableGames(profile, kind);
    if (settings.enabledGames.length > allowed.length || !settings.enabledGames.every((game: unknown) => allowed.includes(game as never))) {
      throw new LibraryError("invalid", "Некорректные настройки.");
    }
    const clean: AppSettings = { menuLayout: settings.menuLayout, learningEnabled: settings.learningEnabled, soundEnabled: settings.soundEnabled, intervalMinutes: settings.intervalMinutes, enabledGames: settings.enabledGames };
    const saved = await writeSharedSettings(profile, clean, revision, familyId);
    if (!saved) return Response.json({ error: "Настройки уже изменили на другом устройстве. Загружена свежая версия. Проверьте её перед сохранением.", profiles: await readableSettings(request, familyId) }, { status: 409, headers });
    return Response.json({ saved }, { headers });
  } catch (error) {
    if (error instanceof LibraryError) return Response.json({ error: error.message }, { status: error.status, headers });
    return unavailable();
  }
}
