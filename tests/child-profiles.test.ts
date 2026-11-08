import { familyRequest } from "./helpers/family-request";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DELETE, PATCH, POST } from "../app/api/profiles/route";
import { GET as GET_SETTINGS, PUT } from "../app/api/profile-settings/route";
import { availableGames, kindOf, MAX_PROFILES, profileSettings, restoreProfiles } from "../app/lib/profiles";

type Row = { profile: string; settings: unknown; revision: number; name: string; avatar: string; kind: string; sort_order: number };
let rows: Row[];
let client = 0;
const builtin = (profile: "mira" | "luke", sort_order: number): Row => ({ profile, settings: profileSettings(profile), revision: 3, name: profile === "mira" ? "Mira" : "Luke", avatar: profile === "mira" ? "🌸" : "🚙", kind: profile, sort_order });
const call = (method: string, body: unknown, origin = "https://app.test") => familyRequest("https://app.test/api/profiles", {
  method, headers: { origin, "Content-Type": "application/json", "x-vercel-forwarded-for": `client-${client++}` }, body: JSON.stringify(body),
});
const put = (body: unknown) => familyRequest("https://app.test/api/profile-settings", {
  method: "PUT", headers: { "X-Game-Schema": "2", origin: "https://app.test", "x-vercel-forwarded-for": `client-${client++}` }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.stubEnv("AUTH_SESSION_SECRET", "test-parent-session-secret-at-least-32-characters");
  rows = [builtin("mira", 0), builtin("luke", 1)];
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubGlobal("fetch", vi.fn(async (input: URL, options: RequestInit = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/rpc/delete_child_profile")) {
      const { child_profile } = JSON.parse(options.body as string);
      const removed = rows.filter(row => row.profile === child_profile);
      rows = rows.filter(row => row.profile !== child_profile);
      return Response.json(removed);
    }
    const profile = url.searchParams.get("profile")?.slice(3);
    const revision = url.searchParams.get("revision")?.slice(3);
    const matching = rows.filter(row => (!profile || row.profile === profile) && (!revision || row.revision === Number(revision)));
    if (options.method === "POST") {
      const row = JSON.parse(options.body as string) as Row;
      if (rows.some(item => item.profile === row.profile)) return new Response("", { status: 409 });
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    if (options.method === "PATCH") {
      matching.forEach(row => Object.assign(row, JSON.parse(options.body as string)));
      return Response.json(matching);
    }
    return Response.json(matching);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("game sets", () => {
  it("keeps Mira's and Luke's own games and gives a new child a shared set", () => {
    expect(kindOf("mira", "toddler")).toBe("mira");
    expect(kindOf("c-abc", "toddler")).toBe("toddler");
    expect(kindOf("c-abc", "mira")).toBe("preschool");
    expect(availableGames("c-abc", "toddler")).toContain("cars");
    expect(availableGames("c-abc", "toddler")).not.toContain("huntrix");
    expect(availableGames("c-abc", "preschool")).toEqual(["letters", "counting", "colors", "words", "syllables"]);
    expect(profileSettings("c-abc", undefined, "toddler")).toMatchObject({ intervalMinutes: 5, enabledGames: ["cars", "luke-count", "car-people"] });
    expect(profileSettings("c-abc", { enabledGames: ["huntrix"] }, "preschool").enabledGames).toEqual(["letters", "counting", "colors", "words", "syllables"]);
  });
  it("restores cached added children, their settings and the device's choice", () => {
    const store = restoreProfiles({ gamesVersion: 2, activeProfile: "c-abc", chosen: true,
      profiles: [{ id: "c-abc", name: "Ваня", avatar: "🦊", kind: "toddler" }, { id: "Bad id", name: "x" }],
      settings: { "c-abc": { intervalMinutes: 3, enabledGames: ["cars"] } } });
    // Another family's device caches only its own children.
    expect(store.profiles.map(child => child.id)).toEqual(["c-abc"]);
    expect(store.activeProfile).toBe("c-abc");
    expect(store.settings["c-abc"]).toMatchObject({ intervalMinutes: 3, enabledGames: ["cars"] });
    expect(store.chosen).toBe(true);
    expect(restoreProfiles(null).chosen).toBe(false);
    // A device that used the app before the picker existed keeps its choice.
    expect(restoreProfiles({ activeProfile: "luke", settings: {} }).chosen).toBe(true);
    expect(restoreProfiles({ activeProfile: "c-gone", profiles: [], settings: {} }).activeProfile).toBe("");
    // A cache written before children existed keeps Mira and Luke.
    expect(restoreProfiles({ activeProfile: "c-gone", settings: {} })).toMatchObject({ activeProfile: "mira", profiles: [{ id: "mira" }, { id: "luke" }] });
  });
});

describe("/api/profiles", () => {
  it("adds a child with defaults for the chosen game set and lists it after Mira and Luke", async () => {
    const response = await POST(call("POST", { name: "  Ваня  ", avatar: "🦊", kind: "toddler" }));
    expect(response.status).toBe(201);
    const { child } = await response.json();
    expect(child).toMatchObject({ name: "Ваня", avatar: "🦊", kind: "toddler", revision: 1, settings: { intervalMinutes: 5, enabledGames: ["cars", "luke-count", "car-people"] } });
    expect(child.profile).toMatch(/^c-[a-f0-9]{12}$/);
    const listed = await (await GET_SETTINGS(familyRequest("https://app.test/api/profile-settings", { headers: { "X-Game-Schema": "2" } }))).json();
    expect(listed.profiles.map((row: { profile: string }) => row.profile)).toEqual(["mira", "luke", child.profile]);
  });
  it.each([
    { name: "", avatar: "🦊", kind: "toddler" },
    { name: "Ваня", avatar: "<script>", kind: "toddler" },
    { name: "Ваня", avatar: "🦊", kind: "mira" },
    { name: "x".repeat(25), avatar: "🦊", kind: "preschool" },
  ])("rejects an invalid new child %j without touching the database", async body => {
    expect((await POST(call("POST", body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses cross-origin changes and never edits or deletes Mira or Luke", async () => {
    expect((await POST(call("POST", { name: "Ваня", avatar: "🦊", kind: "toddler" }, "https://elsewhere.test"))).status).toBe(403);
    expect((await DELETE(call("DELETE", { profile: "luke" }))).status).toBe(403);
    expect((await PATCH(call("PATCH", { profile: "mira", name: "X" }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
  });
  it("renames, then deletes an added child through the database function", async () => {
    const { child } = await (await POST(call("POST", { name: "Ваня", avatar: "🦊", kind: "preschool" }))).json();
    const renamed = await PATCH(call("PATCH", { profile: child.profile, name: "Иван", avatar: "🐻" }));
    expect((await renamed.json()).child).toMatchObject({ name: "Иван", avatar: "🐻", kind: "preschool" });
    const deleted = await DELETE(call("DELETE", { profile: child.profile }));
    expect(await deleted.json()).toEqual({ deleted: child.profile });
    expect(rows.map(row => row.profile)).toEqual(["mira", "luke"]);
    expect((await DELETE(call("DELETE", { profile: child.profile }))).status).toBe(404);
  });
  it(`stops at ${MAX_PROFILES} children`, async () => {
    for (let index = rows.length; index < MAX_PROFILES; index += 1) expect((await POST(call("POST", { name: `Kid ${index}`, avatar: "🐼", kind: "preschool" }))).status).toBe(201);
    const response = await POST(call("POST", { name: "One more", avatar: "🐼", kind: "preschool" }));
    expect(response.status).toBe(409);
    expect(rows).toHaveLength(MAX_PROFILES);
  });
});

describe("settings for an added child", () => {
  it("validates games against the child's stored game set", async () => {
    const { child } = await (await POST(call("POST", { name: "Ваня", avatar: "🦊", kind: "toddler" }))).json();
    const ok = await PUT(put({ profile: child.profile, revision: 1, settings: { ...child.settings, enabledGames: ["cars", "counting"] } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).saved).toMatchObject({ revision: 2, settings: { enabledGames: ["cars", "counting"] } });
    expect((await PUT(put({ profile: child.profile, revision: 2, settings: { ...child.settings, enabledGames: ["huntrix"] } }))).status).toBe(400);
    expect((await PUT(put({ profile: "c-000000000000", revision: 1, settings: child.settings }))).status).toBe(404);
  });
});
