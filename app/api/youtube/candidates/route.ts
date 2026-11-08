import { getSession, sameOrigin } from "../../../lib/auth";
import { dropCandidates, listCandidates } from "../../../lib/youtube-import";
import { addLibraryVideo } from "../../../lib/library-service";
import { readSharedSettings } from "../../../lib/profile-settings-store";

export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы увидеть найденные мультики." }, 401);
  try { return json({ candidates: await listCandidates(session.familyId) }); }
  catch { return json({ error: "Не удалось загрузить список." }, 503); }
}

// Adds up to 15 chosen videos to one child; the category is picked automatically, as for search results.
export async function POST(request: Request) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы добавлять мультики." }, 401);
  if (!sameOrigin(request)) return json({ error: "Откройте приложение и попробуйте снова." }, 403);
  let body: { child?: unknown; videoIds?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Некорректный запрос." }, 400); }
  const ids = Array.isArray(body.videoIds) ? body.videoIds.filter((id): id is string => typeof id === "string" && /^[\w-]{11}$/.test(id)).slice(0, 15) : [];
  try {
    const children = await readSharedSettings(session.familyId);
    if (typeof body.child !== "string" || !children.some(row => row.profile === body.child)) return json({ error: "Выберите ребёнка." }, 400);
    const pending = new Set((await listCandidates(session.familyId)).map(candidate => candidate.videoId));
    const added: string[] = [], failed: string[] = [];
    for (const id of ids.filter(id => pending.has(id))) {
      try { await addLibraryVideo({ profile: body.child, videoId: id }, session.familyId); added.push(id); }
      catch { failed.push(id); }
    }
    await dropCandidates(session.familyId, added);
    return json({ added, failed });
  } catch { return json({ error: "Не удалось связаться с сервером." }, 503); }
}
