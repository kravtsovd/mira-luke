import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as START } from "../app/api/auth/google/route";
import { GET as CALLBACK } from "../app/api/auth/google/callback/route";
import { GET as SESSION } from "../app/api/auth/session/route";
import { GET as CATALOG } from "../app/api/catalog/route";
import { GET as PARENTS, POST as ADD_PARENT, DELETE as REMOVE_PARENT } from "../app/api/family/parents/route";
import { GET as SETTINGS } from "../app/api/profile-settings/route";
import { newSession, safeReturnTo, signValue, verifyValue } from "../app/lib/auth";
import { profileSettings } from "../app/lib/profiles";

const ORIGIN = "https://app.test";
let members: { email: string; family_id: string }[];
let children: { profile: string; family_id: string; settings: unknown; revision: number; name: string; avatar: string; kind: string; sort_order: number }[];
let videos: unknown[];
let idClaims: Record<string, unknown>;
const cookieOf = (response: Response, name: string) => response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(";")[0] ?? "";
const signedIn = (email: string, familyId: string) => `ml_session=${encodeURIComponent(signValue(newSession(email, familyId)))}`;
const get = (path: string, cookie = "") => new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
const send = (path: string, method: string, body: unknown, cookie = "") => new Request(`${ORIGIN}${path}`, { method, headers: { origin: ORIGIN, cookie, "Content-Type": "application/json", "x-vercel-forwarded-for": `ip-${Math.random()}` }, body: JSON.stringify(body) });
const child = (profile: string, family_id: string, kind: string) => ({ profile, family_id, settings: profileSettings(profile, undefined, kind as never), revision: 1, name: profile, avatar: "⭐", kind, sort_order: 0 });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("AUTH_SESSION_SECRET", "x".repeat(40));
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-1");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-1");
  members = [{ email: "dad@example.test", family_id: "demo" }, { email: "jean@example.test", family_id: "petrov" }];
  children = [child("mira", "demo", "mira"), child("luke", "demo", "luke"), child("c-charlotte0", "petrov", "preschool")];
  videos = [
    { youtube_id: "aaaaaaaaaaa", title: "Shared", channel: "C", language: "en", topic_id: "songs", profiles: [] },
    { youtube_id: "bbbbbbbbbbb", title: "Luke", channel: "C", language: "en", topic_id: "songs", profiles: ["luke"] },
    { youtube_id: "ccccccccccc", title: "Charlotte", channel: "C", language: "en", topic_id: "songs", profiles: ["c-charlotte0"] },
    { youtube_id: "ddddddddddd", title: "Both", channel: "C", language: "en", topic_id: "songs", profiles: ["mira", "c-charlotte0"] },
  ];
  idClaims = { iss: "https://accounts.google.com", aud: "client-1", exp: Date.now() / 1000 + 300, email: "Jean@example.test", email_verified: true, name: "Jean" };
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.host === "oauth2.googleapis.com") {
      const body = new URLSearchParams(String(init.body));
      expect(body.get("code_verifier")).toBeTruthy();
      expect(body.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
      return Response.json({ id_token: `x.${Buffer.from(JSON.stringify(idClaims)).toString("base64url")}.y` });
    }
    const eq = (key: string) => url.searchParams.get(key)?.replace(/^eq\./, "");
    if (url.pathname.endsWith("/family_members")) {
      if (init.method === "POST") {
        const row = JSON.parse(String(init.body));
        if (members.some(member => member.email === row.email)) return new Response("", { status: 409 });
        members.push(row); return Response.json([row], { status: 201 });
      }
      if (init.method === "DELETE") {
        const gone = members.filter(member => member.email === eq("email") && member.family_id === eq("family_id"));
        members = members.filter(member => !gone.includes(member)); return Response.json(gone);
      }
      return Response.json(members.filter(member => (!eq("email") || member.email === eq("email")) && (!eq("family_id") || member.family_id === eq("family_id")))
        .map(member => ({ ...member, families: { name: member.family_id === "petrov" ? "Петровы" : "Демо-семья" } })));
    }
    if (url.pathname.endsWith("/families")) return Response.json([{ name: eq("id") === "petrov" ? "Петровы" : "Демо-семья" }]);
    if (url.pathname.endsWith("/profile_settings")) return Response.json(children.filter(row => (!eq("family_id") || row.family_id === eq("family_id")) && (!eq("profile") || row.profile === eq("profile"))));
    if (url.pathname.endsWith("/videos")) return Response.json(videos);
    throw new Error(`unexpected ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("session cookie", () => {
  it("rejects a tampered or foreign signature and unsafe return paths", () => {
    const token = signValue({ a: 1 });
    expect(verifyValue(token)).toEqual({ a: 1 });
    expect(verifyValue(token.replace(/.$/, token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(verifyValue(`${Buffer.from('{"a":2}').toString("base64url")}.${token.split(".")[1]}`)).toBeNull();
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("https://evil.test")).toBe("/");
    expect(safeReturnTo("/?video=abc")).toBe("/?video=abc");
  });
});

describe("Google sign-in", () => {
  async function start() {
    const response = await START(get("/api/auth/google?return=/%3Ftheme%3Dsongs"));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("accounts.google.com");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    return { state: location.searchParams.get("state")!, cookie: cookieOf(response, "ml_oauth") };
  }

  it("signs an invited parent into their own family and returns them where they were", async () => {
    const { state, cookie } = await start();
    const response = await CALLBACK(get(`/api/auth/google/callback?code=abc&state=${state}`, cookie));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?theme=songs`);
    const session = cookieOf(response, "ml_session");
    expect(session).toBeTruthy();
    const me = await (await SESSION(get("/api/auth/session", session))).json();
    expect(me).toMatchObject({ signedIn: true, email: "jean@example.test", family: { id: "petrov", name: "Петровы" } });
    const settings = await (await SETTINGS(new Request(`${ORIGIN}/api/profile-settings`, { headers: { cookie: session, "X-Game-Schema": "2" } }))).json();
    expect(settings.profiles.map((row: { profile: string }) => row.profile)).toEqual(["c-charlotte0"]);
  });

  it("refuses a forged state, an unverified email and an email no family invited", async () => {
    const { cookie } = await start();
    expect((await CALLBACK(get("/api/auth/google/callback?code=abc&state=forged", cookie))).headers.get("location")).toContain("login=expired");
    let fresh = await start();
    idClaims.email_verified = false;
    expect((await CALLBACK(get(`/api/auth/google/callback?code=abc&state=${fresh.state}`, fresh.cookie))).headers.get("location")).toContain("login=failed");
    fresh = await start();
    // Self-signup is on by default (tests/signup-youtube.test.ts); invite-only mode still refuses strangers.
    vi.stubEnv("SIGNUP_DISABLED", "1");
    idClaims = { ...idClaims, email_verified: true, email: "stranger@example.test" };
    const response = await CALLBACK(get(`/api/auth/google/callback?code=abc&state=${fresh.state}`, fresh.cookie));
    expect(response.headers.get("location")).toContain("login=not_invited");
    expect(cookieOf(response, "ml_session")).toBe("");
  });

  it("never assigns the real family to signed-out visitors, including with the old opt-in", async () => {
    const me = await (await SESSION(get("/api/auth/session"))).json();
    expect(me).toMatchObject({ signedIn: false, family: null });
    vi.stubEnv("ALLOW_ANONYMOUS_FAMILY", "1");
    expect((await (await SESSION(get("/api/auth/session"))).json()).family).toBeNull();
    expect((await SETTINGS(get("/api/profile-settings"))).status).toBe(401);
  });
});

describe("family isolation", () => {
  it("sends each family only shared videos and its own children's videos", async () => {
    const titles = async (cookie = "") => (await (await CATALOG(get("/api/catalog", cookie))).json()).items.map((video: { title: string; profiles?: string[] }) => `${video.title}:${(video.profiles ?? []).join(",")}`);
    expect(await titles()).toEqual(["Shared:"]);
    expect(await titles(signedIn("dad@example.test", "demo"))).toEqual(["Shared:", "Luke:luke", "Both:mira"]);
    expect(await titles(signedIn("jean@example.test", "petrov"))).toEqual(["Shared:", "Charlotte:c-charlotte0", "Both:c-charlotte0"]);
  });
  it("lets a signed-in parent add and remove other adults, never themselves or someone else's email", async () => {
    const jean = signedIn("jean@example.test", "petrov");
    expect((await PARENTS(get("/api/family/parents"))).status).toBe(401);
    expect(await (await PARENTS(get("/api/family/parents", jean))).json()).toEqual({ parents: ["jean@example.test"], you: "jean@example.test" });
    expect((await ADD_PARENT(send("/api/family/parents", "POST", { email: " Mama@Example.Test " }, jean))).status).toBe(200);
    expect(members.find(member => member.email === "mama@example.test")).toMatchObject({ family_id: "petrov", added_by: "jean@example.test" });
    expect((await ADD_PARENT(send("/api/family/parents", "POST", { email: "dad@example.test" }, jean))).status).toBe(409);
    expect((await REMOVE_PARENT(send("/api/family/parents", "DELETE", { email: "jean@example.test" }, jean))).status).toBe(400);
    expect((await REMOVE_PARENT(send("/api/family/parents", "DELETE", { email: "dad@example.test" }, jean))).status).toBe(404);
    expect((await REMOVE_PARENT(send("/api/family/parents", "DELETE", { email: "mama@example.test" }, jean))).status).toBe(200);
  });
});
