import { cookie, getSession, googleConfig, newOAuthState, signValue } from "../../../lib/auth";
import { YOUTUBE_SCOPE } from "../../../lib/youtube-import";

export const runtime = "nodejs";
const YT_COOKIE = "ml_yt";

export async function GET(request: Request) {
  const session = getSession(request);
  const config = googleConfig();
  if (!session || !config) return Response.redirect(new URL("/?youtube=signin", request.url), 302);
  const { state, verifier, challenge } = newOAuthState("/");
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: new URL("/api/auth/google/callback", request.url).toString(), response_type: "code",
    scope: YOUTUBE_SCOPE, state, code_challenge: challenge, code_challenge_method: "S256", login_hint: session.email, prompt: "consent",
  }).toString();
  return new Response(null, { status: 302, headers: { Location: google.toString(), "Cache-Control": "no-store",
    "Set-Cookie": cookie(YT_COOKIE, signValue({ state, verifier, family: session.familyId, exp: Math.floor(Date.now() / 1000) + 600 }), request, 600) } });
}
