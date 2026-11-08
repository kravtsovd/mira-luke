import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHash } from "node:crypto";
import { DELETE as REVOKE, GET as LIST_KEYS, POST as CREATE_KEY } from "../app/api/family/agent-keys/route";
import { GET as FAMILY } from "../app/api/agent/v1/family/route";
import { DELETE as REMOVE, GET as LIBRARY, POST as ADD } from "../app/api/agent/v1/library/route";
import { GET as INSTRUCTIONS } from "../app/api/agent/v1/instructions/route";
import { newSession, signValue } from "../app/lib/auth";
import { profileSettings } from "../app/lib/profiles";

const ORIGIN = "https://app.test";
let keys: Record<string, unknown>[];
let children: Record<string, unknown>[];
let videos: Record<string, unknown>[];
let inserted: Record<string, unknown>[];
const parent = (email: string, family: string) => `ml_session=${encodeURIComponent(signValue(newSession(email, family)))}`;
const manage = (method: string, cookie: string, body: object = {}) => new Request(`${ORIGIN}/api/family/agent-keys`, { method, headers: { cookie, origin: ORIGIN, "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) });
const agent = (path: string, key: string, method = "GET", body?: object) => new Request(`${ORIGIN}/api/agent/v1/${path}`, { method, headers: { authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const row = (profile: string, family_id: string, kind: string) => ({ profile, family_id, kind, name: profile, avatar: "⭐", revision: 1, sort_order: 0, settings: profileSettings(profile, undefined, kind as never) });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("AUTH_SESSION_SECRET", "x".repeat(40));
  keys = []; inserted = [];
  children = [row("mira", "demo", "mira"), row("luke", "demo", "luke"), row("c-charlotte01", "zhan", "preschool")];
  videos = [
    { youtube_id: "aaaaaaaaaaa", title: "Shared", channel: "C", language: "en", topic_id: "songs", profiles: [], enabled: true },
    { youtube_id: "ccccccccccc", title: "Charlotte only", channel: "C", language: "en", topic_id: "songs", profiles: ["c-charlotte01"], enabled: true },
  ];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, "");
    if (url.pathname.endsWith("/family_agent_keys")) {
      if (init.method === "POST") {
        const record = { id: crypto.randomUUID(), created_at: new Date().toISOString(), last_used_at: null, revoked_at: null, ...JSON.parse(String(init.body)) };
        keys.push(record); inserted.push(JSON.parse(String(init.body)));
        return Response.json([record], { status: 201 });
      }
      const match = keys.filter(key => (!eq("family_id") || key.family_id === eq("family_id")) && (!eq("id") || key.id === eq("id"))
        && (!eq("key_hash") || key.key_hash === eq("key_hash")) && (url.searchParams.get("revoked_at") !== "is.null" || !key.revoked_at));
      if (init.method === "PATCH") { match.forEach(key => Object.assign(key, JSON.parse(String(init.body)))); return Response.json(match); }
      return Response.json(match);
    }
    if (url.pathname.endsWith("/profile_settings")) return Response.json(children.filter(child => (!eq("family_id") || child.family_id === eq("family_id")) && (!eq("profile") || child.profile === eq("profile"))));
    if (url.pathname.endsWith("/families")) return Response.json([{ name: "Семья" }]);
    if (url.pathname.endsWith("/rpc/remove_video_from_profile")) {
      const { video_id, child_profile } = JSON.parse(String(init.body));
      const video = videos.find(item => item.youtube_id === video_id);
      if (!video) return Response.json("missing");
      const profiles = video.profiles as string[];
      if (!profiles.length) return Response.json("shared");
      if (!profiles.includes(child_profile)) return Response.json("not_member");
      video.profiles = profiles.filter(profile => profile !== child_profile);
      return Response.json("removed");
    }
    if (url.pathname.endsWith("/rpc/add_video_to_profile")) {
      const { video_id, child_profile } = JSON.parse(String(init.body));
      const video = videos.find(item => item.youtube_id === video_id)!;
      video.profiles = [...(video.profiles as string[]), child_profile];
      return Response.json([video]);
    }
    if (url.pathname.endsWith("/videos")) return Response.json(videos.filter(video => !eq("youtube_id") || video.youtube_id === eq("youtube_id")));
    throw new Error(`unexpected ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function newKey(email: string, family: string) {
  const response = await CREATE_KEY(manage("POST", parent(email, family), { label: "Claude" }));
  expect(response.status).toBe(201);
  return (await response.json()).key as string;
}

describe("agent keys", () => {
  it("are created only by a signed-in parent and stored as a hash", async () => {
    expect((await CREATE_KEY(manage("POST", ""))).status).toBe(401);
    const key = await newKey("jean@example.test", "zhan");
    expect(key).toMatch(/^mlk_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(inserted)).not.toContain(key);
    expect(inserted[0].key_hash).toBe(createHash("sha256").update(key).digest("hex"));
    const listed = await (await LIST_KEYS(manage("GET", parent("jean@example.test", "zhan")))).json();
    expect(listed.keys).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(key);
  });

  it("open only their own family; a wrong or revoked key opens nothing", async () => {
    const key = await newKey("jean@example.test", "zhan");
    const family = await (await FAMILY(agent("family", key))).json();
    expect(family.children.map((child: { id: string }) => child.id)).toEqual(["c-charlotte01"]);
    expect((await LIBRARY(agent("library?child=mira", key))).status).toBe(400);
    expect((await FAMILY(agent("family", "mlk_" + "x".repeat(43)))).status).toBe(401);
    expect((await FAMILY(new Request(`${ORIGIN}/api/agent/v1/family`))).status).toBe(401);
    const id = (await (await LIST_KEYS(manage("GET", parent("jean@example.test", "zhan")))).json()).keys[0].id;
    expect((await REVOKE(manage("DELETE", parent("dad@example.test", "demo"), { id }))).status).toBe(404);
    expect((await REVOKE(manage("DELETE", parent("jean@example.test", "zhan"), { id }))).status).toBe(200);
    expect((await FAMILY(agent("family", key))).status).toBe(401);
  });
});

describe("agent library", () => {
  it("lists a child's videos, adds one, and removes only the child's own", async () => {
    const key = await newKey("jean@example.test", "zhan");
    const listed = await (await LIBRARY(agent("library?child=c-charlotte01", key))).json();
    expect(listed.videos.map((video: { id: string; own: boolean }) => `${video.id}:${video.own}`)).toEqual(["aaaaaaaaaaa:false", "ccccccccccc:true"]);
    const added = await ADD(agent("library", key, "POST", { child: "c-charlotte01", video: "https://youtu.be/aaaaaaaaaaa", topicId: "songs" }));
    expect([200, 201]).toContain(added.status);
    expect((await REMOVE(agent("library", key, "DELETE", { child: "c-charlotte01", video: "ccccccccccc" }))).status).toBe(200);
    expect(videos[1].profiles).toEqual([]);
    videos[0].profiles = [];
    expect((await REMOVE(agent("library", key, "DELETE", { child: "c-charlotte01", video: "aaaaaaaaaaa" }))).status).toBe(409);
  });

  it("publishes the instruction with a placeholder instead of any key", async () => {
    const text = await (await INSTRUCTIONS(new Request(`${ORIGIN}/api/agent/v1/instructions`))).text();
    expect(text).toContain(`${ORIGIN}/api/agent/v1/library`);
    expect(text).toContain("youtube.com/feed/history");
    expect(text).not.toMatch(/mlk_[A-Za-z0-9_-]{20}/);
  });
});
