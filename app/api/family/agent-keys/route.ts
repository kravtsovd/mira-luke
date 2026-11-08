import { getSession, sameOrigin } from "../../../lib/auth";
import { createAgentKey, listAgentKeys, MAX_ACTIVE_KEYS, revokeAgentKey } from "../../../lib/agent-keys";
import { LibraryBurstGuard } from "../../../lib/library-auth";

export const runtime = "nodejs";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы управлять ключами агента." }, 401);
  try { return json({ keys: await listAgentKeys(session.familyId) }); }
  catch { return json({ error: "Не удалось связаться с сервером." }, 503); }
}

async function guarded(request: Request, action: (familyId: string, email: string, body: Record<string, unknown>) => Promise<Response>) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы управлять ключами агента." }, 401);
  if (!sameOrigin(request)) return json({ error: "Откройте настройки в приложении." }, 403);
  try {
    guard.check(session.email);
    const raw = await request.text();
    if (raw.length > 512) return json({ error: "Слишком большой запрос." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Некорректный запрос." }, 400); }
    return await action(session.familyId, session.email, body ?? {});
  } catch (error) {
    if (error instanceof Error && /Немного подожди/.test(error.message)) return json({ error: error.message }, 429);
    return json({ error: "Не удалось связаться с сервером." }, 503);
  }
}

export const POST = (request: Request) => guarded(request, async (familyId, email, body) => {
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "Мой агент";
  const created = await createAgentKey(familyId, email, label);
  if (created === "limit") return json({ error: `Можно держать до ${MAX_ACTIVE_KEYS} ключей. Отзовите ненужный.` }, 409);
  return json({ key: created.key, record: created.record }, 201);
});

export const DELETE = (request: Request) => guarded(request, async (familyId, _email, body) => {
  if (!await revokeAgentKey(familyId, String(body.id ?? ""))) return json({ error: "Ключ не найден." }, 404);
  return json({ keys: await listAgentKeys(familyId) });
});
