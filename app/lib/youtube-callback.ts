import "server-only";
import { cookie, getSession, googleConfig, readCookie, verifyValue } from "./auth";
import { collectCandidates, saveCandidates } from "./youtube-import";

export const YT_COOKIE = "ml_yt";

function back(request: Request, path: string, clear: string) {
  return new Response(null, { status: 302, headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "no-store", "Set-Cookie": clear } });
}

export async function handleYoutubeCallback(request: Request, redirectPath: string) {
  const url = new URL(request.url);
  const clear = cookie(YT_COOKIE, "", request, 0);
  const session = getSession(request);
  const saved = verifyValue<{ state: string; verifier: string; family: string; exp: number }>(readCookie(request, YT_COOKIE));
  const code = url.searchParams.get("code");
  const config = googleConfig();
  if (!session || !config || !saved || saved.family !== session.familyId || !(saved.exp > Date.now() / 1000) || !code || url.searchParams.get("state") !== saved.state) {
    return back(request, `/?youtube=${url.searchParams.get("error") === "access_denied" ? "denied" : "expired"}`, clear);
  }
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, code_verifier: saved.verifier, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: new URL(redirectPath, request.url).toString(), grant_type: "authorization_code" }),
    });
    const { access_token: token } = await response.json() as { access_token?: string };
    if (!response.ok || !token) throw new Error("token");
    const candidates = await collectCandidates(token);
    await saveCandidates(session.familyId, candidates);
    // Give the access back right away; nothing else needs it.
    void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
    console.info(JSON.stringify({ event: "youtube_import_ready", family: session.familyId, candidates: candidates.length }));
    return back(request, `/?youtube=ready`, clear);
  } catch (error) {
    console.info(JSON.stringify({ event: "youtube_import_failed", family: session.familyId, reason: error instanceof Error ? error.message.slice(0, 60) : "unknown" }));
    return back(request, "/?youtube=failed", clear);
  }
}
