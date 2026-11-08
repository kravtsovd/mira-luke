import { authorizeLibrary, libraryBurstGuard } from "../../lib/library-auth";
import { LibraryError, parseLibraryInput } from "../../lib/library-input";
import { addLibraryVideo } from "../../lib/library-service";
import { requestFamily } from "../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const headers = new Headers({ "Cache-Control": "no-store" });
  let videoId: string | undefined;
  try {
    // Bound the body while streaming; Content-Length alone is not trustworthy.
    const reader = request.body?.getReader();
    if (!reader) throw new LibraryError("invalid_request", "Пустой запрос.");
    let size = 0;
    const decoder = new TextDecoder();
    let raw = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) { await reader.cancel(); throw new LibraryError("request_too_large", "Слишком большой запрос.", 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new LibraryError("invalid_request", "Не удалось прочитать запрос."); }
    const parsed = parseLibraryInput(body);
    videoId = parsed.id;
    authorizeLibrary(request, parsed.id, body.libraryTicket);
    libraryBurstGuard.check(request.headers.get("x-vercel-forwarded-for") ?? "local");
    console.info(JSON.stringify({ event: "library_add_attempt", requestId, videoId }));
    const familyId = requestFamily(request);
    if (!familyId) throw new LibraryError("sign_in", "Войдите, чтобы добавлять мультики.", 401);
    const result = await addLibraryVideo(body, familyId);
    console.info(JSON.stringify({ event: `library_add_${result.status}`, requestId, videoId, topicId: result.video.topicId, mode: parsed.topicId ? "manual" : "auto", elapsedMs: Date.now() - started }));
    return Response.json(result, { status: result.status === "added" ? 201 : 200, headers });
  } catch (error) {
    const safe = error instanceof LibraryError ? error : new LibraryError("internal_error", "Не удалось добавить видео. Попробуйте ещё раз.", 500);
    if (safe.status === 429) headers.set("Retry-After", "60");
    console.info(JSON.stringify({ event: "library_add_failed", requestId, videoId, code: safe.code, elapsedMs: Date.now() - started }));
    return Response.json({ error: safe.message, code: safe.code, manualAllowed: safe.manualAllowed }, { status: safe.status, headers });
  }
}
