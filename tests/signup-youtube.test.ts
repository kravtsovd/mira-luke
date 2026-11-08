import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as START } from "../app/api/auth/google/route";
import { GET as CALLBACK } from "../app/api/auth/google/callback/route";
import { collectCandidates } from "../app/lib/youtube-import";
import { POST as ADD } from "../app/api/youtube/candidates/route";
import { newSession, signValue } from "../app/lib/auth";
import { profileSettings } from "../app/lib/profiles";

const ORIGIN = "https://app.test";
let members: { email: string; family_id: string }[]; let families: { id: string; name: string }[]; let candidates: { family_id: string; video_id: string }[];
const cookieOf = (r: Response, n: string) => r.headers.getSetCookie().find(v => v.startsWith(`${n}=`))?.split(";")[0] ?? "";

beforeEach(() => {
  for (const [k, v] of Object.entries({ SUPABASE_URL: "https://db.test", SUPABASE_SECRET_KEY: "k", AUTH_SESSION_SECRET: "x".repeat(40), GOOGLE_CLIENT_ID: "client-1", GOOGLE_CLIENT_SECRET: "s" })) vi.stubEnv(k, v);
  members = [{ email: "dad@example.test", family_id: "demo" }]; families = [{ id: "demo", name: "Демо-семья" }];
  candidates = [{ family_id: "f-new", video_id: "aaaaaaaaaaa" }];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input)); const eq = (n: string) => url.searchParams.get(n)?.replace(/^eq\./, "");
    if (url.host === "oauth2.googleapis.com") return Response.json({ id_token: `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: "client-1", exp: Date.now() / 1000 + 60, email: "new.mom@example.test", email_verified: true, name: "Анна Иванова" })).toString("base64url")}.y` });
    if (url.pathname.endsWith("/families")) {
      if (init.method === "POST") { families.push(JSON.parse(String(init.body))); return Response.json([JSON.parse(String(init.body))], { status: 201 }); }
      return Response.json(families.filter(f => f.id === eq("id")));
    }
    if (url.pathname.endsWith("/family_members")) {
      if (init.method === "POST") { const row = JSON.parse(String(init.body)); if (members.some(m => m.email === row.email)) return new Response("", { status: 409 }); members.push(row); return Response.json([row], { status: 201 }); }
      return Response.json(members.filter(m => m.email === eq("email")).map(m => ({ ...m, families: { name: families.find(f => f.id === m.family_id)?.name } })));
    }
    throw new Error(`unexpected ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("self-signup", () => {
  async function signIn() {
    const start = await START(new Request(`${ORIGIN}/api/auth/google`));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    return CALLBACK(new Request(`${ORIGIN}/api/auth/google/callback?code=c&state=${state}`, { headers: { cookie: cookieOf(start, "ml_oauth") } }));
  }
  it("gives an unknown Google account its own new family and opens onboarding", async () => {
    const response = await signIn();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/?welcome=1`);
    expect(cookieOf(response, "ml_session")).toBeTruthy();
    const member = members.find(m => m.email === "new.mom@example.test")!;
    expect(member.family_id).toMatch(/^f-[0-9a-f]{10}$/);
    expect(families.find(f => f.id === member.family_id)?.name).toBe("Семья Анна");
  });
  it("stays invite-only when SIGNUP_DISABLED=1", async () => {
    vi.stubEnv("SIGNUP_DISABLED", "1");
    expect((await signIn()).headers.get("location")).toContain("login=not_invited");
    expect(members).toHaveLength(1);
  });
});

describe("YouTube import", () => {
  it("keeps only videos YouTube marks made for kids, from likes, playlists and subscriptions", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input)); const p = url.pathname;
      if (p.endsWith("/videos") && url.searchParams.get("myRating")) return Response.json({ items: [{ id: "kidLiked001" }, { id: "adultVid001" }] });
      if (p.endsWith("/playlists")) return Response.json({ items: [{ id: "PL1" }] });
      if (p.endsWith("/playlistItems") && url.searchParams.get("playlistId") === "PL1") return Response.json({ items: [{ contentDetails: { videoId: "kidPlaylist" } }] });
      if (p.endsWith("/subscriptions")) return Response.json({ items: [{ snippet: { resourceId: { channelId: "UC1" } } }] });
      if (p.endsWith("/channels")) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] });
      if (p.endsWith("/playlistItems")) return Response.json({ items: [{ contentDetails: { videoId: "kidUpload01" } }, { contentDetails: { videoId: "kidLiked001" } }] });
      if (p.endsWith("/videos")) {
        const ids = url.searchParams.get("id")!.split(",");
        return Response.json({ items: ids.map(id => ({ id, snippet: { title: `T ${id}`, channelTitle: "C" }, status: { madeForKids: id !== "adultVid001", embeddable: true } })) });
      }
      throw new Error(`unexpected ${url}`);
    }));
    const found = await collectCandidates("token");
    expect(found.map(c => `${c.videoId}:${c.source}`)).toEqual(["kidLiked001:liked", "kidPlaylist:playlist", "kidUpload01:subscription"]);
  });
  it("adds only to the parent's own child", async () => {
    const children = [{ profile: "c-anna000001", family_id: "f-new", settings: profileSettings("c-anna000001"), revision: 1, name: "A", avatar: "⭐", kind: "preschool", sort_order: 0 }];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/profile_settings")) return Response.json(children.filter(c => url.searchParams.get("family_id") === `eq.${c.family_id}`));
      if (url.pathname.endsWith("/youtube_import_candidates")) return Response.json(candidates.map(c => ({ video_id: c.video_id, title: "t", channel: "c", source: "liked" })));
      throw new Error(`unexpected ${url}`);
    }));
    const cookie = `ml_session=${encodeURIComponent(signValue(newSession("new.mom@example.test", "f-new")))}`;
    const response = await ADD(new Request(`${ORIGIN}/api/youtube/candidates`, { method: "POST", headers: { cookie, origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ child: "mira", videoIds: ["aaaaaaaaaaa"] }) }));
    expect(response.status).toBe(400);
  });
});
