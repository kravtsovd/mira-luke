import { cookie, exchangeGoogleCode, newSession, OAUTH_COOKIE, readCookie, safeReturnTo, sessionCookie, verifyValue } from "../../../../lib/auth";
import { createFamilyFor, memberFamily } from "../../../../lib/family-store";
import { handleYoutubeCallback, YT_COOKIE } from "../../../../lib/youtube-callback";

export const runtime = "nodejs";
export const maxDuration = 60;

function back(request: Request, path: string, cookies: string[]) {
  const headers = new Headers({ Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}

// Existing parents open their family; a new verified Google account creates a separate family.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const youtube = verifyValue<{ state: string }>(readCookie(request, YT_COOKIE));
  if (youtube && youtube.state === url.searchParams.get("state")) return handleYoutubeCallback(request, "/api/auth/google/callback");
  const clearState = cookie(OAUTH_COOKIE, "", request, 0);
  const saved = verifyValue<{ state: string; verifier: string; returnTo: string; exp: number }>(readCookie(request, OAUTH_COOKIE));
  const code = url.searchParams.get("code");
  if (!saved || !(saved.exp > Date.now() / 1000) || !code || url.searchParams.get("state") !== saved.state) {
    return back(request, "/?login=expired", [clearState]);
  }
  try {
    const identity = await exchangeGoogleCode(code, saved.verifier, request);
    let family = await memberFamily(identity.email);
    let returnTo = safeReturnTo(saved.returnTo);
    if (!family) {

      if (process.env.SIGNUP_DISABLED === "1") {
        console.info(JSON.stringify({ event: "login_not_invited", domain: identity.email.split("@")[1] }));
        return back(request, `/?login=not_invited&email=${encodeURIComponent(identity.email)}`, [clearState]);
      }
      family = await createFamilyFor(identity.email, identity.name);
      console.info(JSON.stringify({ event: "signup", family: family.familyId }));
      returnTo = "/?welcome=1";
    }
    console.info(JSON.stringify({ event: "login_ok", family: family.familyId }));
    return back(request, returnTo, [clearState, sessionCookie(newSession(identity.email, family.familyId, identity.name), request)]);
  } catch {
    return back(request, "/?login=failed", [clearState]);
  }
}
