import { getSession, sameOrigin } from "../../../lib/auth";
import { addParent, listParents, normalizeEmail, removeParent } from "../../../lib/family-store";
import { LibraryBurstGuard } from "../../../lib/library-auth";

export const runtime = "nodejs";
const guard = new LibraryBurstGuard();
const headers = { "Cache-Control": "no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы увидеть взрослых семьи." }, 401);
  try { return json({ parents: (await listParents(session.familyId)).map(parent => parent.email), you: session.email }); }
  catch { return json({ error: "Не удалось связаться с сервером." }, 503); }
}

async function change(request: Request, action: "add" | "remove") {
  const session = getSession(request);
  if (!session) return json({ error: "Войдите, чтобы менять взрослых семьи." }, 401);
  if (!sameOrigin(request)) return json({ error: "Откройте настройки в приложении." }, 403);
  try {
    guard.check(request.headers.get("x-vercel-forwarded-for") ?? "local");
    const raw = await request.text();
    if (raw.length > 512) return json({ error: "Слишком большой запрос." }, 413);
    let body: { email?: unknown } = {};
    try { body = JSON.parse(raw); } catch { /* Falls through to the email check. */ }
    const email = normalizeEmail(body?.email);
    if (!email) return json({ error: "Введите email, например name@example.test." }, 400);
    if (action === "add") {
      const result = await addParent(session.familyId, email, session.email);
      if (result === "exists") return json({ error: "Этот email уже открывает какую-то семью. Сначала его нужно убрать оттуда." }, 409);
      if (result === "limit") return json({ error: "В семье уже 10 взрослых." }, 409);
    } else {
      if (email === session.email) return json({ error: "Себя убрать нельзя: попросите другого взрослого." }, 400);
      if (!await removeParent(session.familyId, email)) return json({ error: "Такого взрослого в семье нет." }, 404);
    }
    return json({ parents: (await listParents(session.familyId)).map(parent => parent.email), you: session.email });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Немного подожди")) return json({ error: error.message }, 429);
    return json({ error: "Не удалось связаться с сервером." }, 503);
  }
}
export const POST = (request: Request) => change(request, "add");
export const DELETE = (request: Request) => change(request, "remove");
