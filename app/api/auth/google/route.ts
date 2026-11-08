import { cookie, googleConfig, callbackUrl, newOAuthState, OAUTH_COOKIE, safeReturnTo, signValue } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = googleConfig();
  if (!config) return Response.redirect(new URL("/?login=unavailable", request.url), 302);
  const { state, verifier, challenge, returnTo } = newOAuthState(safeReturnTo(new URL(request.url).searchParams.get("return")));
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: callbackUrl(request), response_type: "code", scope: "openid email profile",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return new Response(null, { status: 302, headers: {
    Location: google.toString(), "Cache-Control": "no-store",
    "Set-Cookie": cookie(OAUTH_COOKIE, signValue({ state, verifier, returnTo, exp: Math.floor(Date.now() / 1000) + 600 }), request, 600),
  } });
}
