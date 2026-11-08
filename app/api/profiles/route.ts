import { LibraryBurstGuard } from "../../lib/library-auth";
import { LibraryError } from "../../lib/library-input";
import { BUILTIN_PROFILES, isBuiltinProfile, isNewChildKind, isProfileId, MAX_PROFILE_NAME, MAX_PROFILES, PROFILE_AVATARS } from "../../lib/profiles";
import { createChild, deleteChild, ProfileStoreError, renameChild } from "../../lib/profile-settings-store";
import { requestFamily } from "../../lib/auth";

export const runtime = "nodejs";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "no-store" };
const AVATARS: readonly string[] = [...PROFILE_AVATARS, ...BUILTIN_PROFILES.map(child => child.avatar)];

function cleanName(value: unknown): string {
  if (typeof value !== "string" || value.length > 200) throw new LibraryError("invalid_name", "Введите имя ребёнка.");
  const name = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) throw new LibraryError("invalid_name", "Введите имя ребёнка.");
  if ([...name].length > MAX_PROFILE_NAME) throw new LibraryError("invalid_name", `Имя должно быть не длиннее ${MAX_PROFILE_NAME} символов.`);
  return name;
}
function cleanAvatar(value: unknown): string {
  if (typeof value !== "string" || !AVATARS.includes(value)) throw new LibraryError("invalid_avatar", "Выберите картинку из списка.");
  return value;
}

function familyOf(request: Request): string {
  const familyId = requestFamily(request);
  if (!familyId) throw new LibraryError("sign_in", "Войдите, чтобы менять профили семьи.", 401);
  return familyId;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new LibraryError("forbidden_origin", "Откройте настройки в приложении.", 403);
  }
  guard.check(request.headers.get("x-vercel-forwarded-for") ?? "local");
  const raw = await request.text();
  if (raw.length > 1024) throw new LibraryError("too_large", "Слишком большой запрос.", 413);
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch { /* Falls through to the shared message. */ }
  throw new LibraryError("invalid", "Некорректный запрос.");
}

function childId(value: unknown): string {
  if (!isProfileId(value)) throw new LibraryError("invalid_profile", "Ребёнок не найден. Обновите страницу.");
  if (isBuiltinProfile(value)) throw new LibraryError("protected_profile", "Профили Миры и Люка нельзя менять или удалять.", 403);
  return value;
}

async function respond(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof LibraryError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
    if (error instanceof ProfileStoreError && error.code === "limit") return Response.json({ error: `В семье может быть до ${MAX_PROFILES} детей.`, code: "limit" }, { status: 409, headers });
    if (error instanceof ProfileStoreError && error.code === "missing") return Response.json({ error: "Этого ребёнка уже удалили. Обновите страницу.", code: "missing" }, { status: 404, headers });
    return Response.json({ error: "Не удалось связаться с сервером. Попробуйте ещё раз.", code: "unavailable" }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    const familyId = familyOf(request);
    if (!isNewChildKind(body.kind)) throw new LibraryError("invalid_kind", "Выберите набор игр.");
    const child = await createChild({ name: cleanName(body.name), avatar: cleanAvatar(body.avatar), kind: body.kind }, familyId);
    return Response.json({ child }, { status: 201, headers });
  });
}

export async function PATCH(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    const profile = childId(body.profile);
    const change = { ...(body.name !== undefined ? { name: cleanName(body.name) } : {}), ...(body.avatar !== undefined ? { avatar: cleanAvatar(body.avatar) } : {}) };
    if (!Object.keys(change).length) throw new LibraryError("invalid", "Нечего сохранять.");
    return Response.json({ child: await renameChild(profile, change, familyOf(request)) }, { headers });
  });
}

export async function DELETE(request: Request) {
  return respond(async () => {
    const profile = childId((await readBody(request)).profile);
    await deleteChild(profile, familyOf(request));
    return Response.json({ deleted: profile }, { headers });
  });
}
