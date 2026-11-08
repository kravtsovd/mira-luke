import "server-only";
import { familyForAgentKey } from "./agent-keys";
import { LibraryBurstGuard } from "./library-auth";
import { LibraryError, normalizeVideoId } from "./library-input";
import { readSharedSettings } from "./profile-settings-store";

export const agentHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
const guard = new LibraryBurstGuard();
export const DOCS_URL = "https://localhost/agent";

export const agentError = (status: number, code: string, error: string) =>
  Response.json({ error, code, docs: DOCS_URL }, { status, headers: agentHeaders });

export async function agentContext(request: Request) {
  let auth;
  try { auth = await familyForAgentKey(request); } catch { throw new LibraryError("unavailable", "Сервер временно недоступен.", 503); }
  if (!auth) throw new LibraryError("unauthorized", "Нужен заголовок Authorization: Bearer mlk_... Ключ создаётся в «Для взрослых» → «Семья» → «ИИ-агент».", 401);
  guard.check(auth.keyId);
  const children = await readSharedSettings(auth.familyId);
  return { ...auth, children };
}

export function requireChild(children: { profile: string }[], child: unknown): string {
  if (typeof child !== "string" || !children.some(row => row.profile === child)) {
    throw new LibraryError("unknown_child", `Укажите child - id ребёнка из GET /api/agent/v1/family (${children.map(row => row.profile).join(", ")}).`, 400);
  }
  return child;
}

export async function readAgentBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 4096) throw new LibraryError("too_large", "Слишком большой запрос.", 413);
  try { const body = JSON.parse(raw); if (body && typeof body === "object" && !Array.isArray(body)) return body; } catch { /* below */ }
  throw new LibraryError("invalid", "Тело запроса - JSON-объект.", 400);
}

export function agentFailure(error: unknown) {
  if (error instanceof LibraryError) return agentError(error.status, error.code, error.message);
  return agentError(503, "unavailable", "Сервер временно недоступен. Повторите позже.");
}

export const videoIdFrom = (value: unknown) => normalizeVideoId(value);

export async function removeVideoFromChild(videoId: string, child: string): Promise<string> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("storage unavailable");
  const response = await fetch(new URL("/rest/v1/rpc/remove_video_from_profile", base), {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: videoId, child_profile: child }),
  });
  if (!response.ok) throw new Error("storage unavailable");
  return String(await response.json());
}
