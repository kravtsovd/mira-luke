import { familyRequest } from "./helpers/family-request";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, PUT } from "../app/api/profile-settings/route";
import { profileSettings } from "../app/lib/profiles";

let rows: { profile: string; settings: ReturnType<typeof profileSettings>; revision: number }[];
let client = 0;
const request = (body: unknown, origin = "https://app.test") => familyRequest("https://app.test/api/profile-settings", {
  method: "PUT", headers: { "X-Game-Schema": "2", origin, "x-vercel-forwarded-for": `client-${client++}` }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.stubEnv("AUTH_SESSION_SECRET", "test-parent-session-secret-at-least-32-characters");
  rows = ["mira", "luke"].map(profile => ({ profile, settings: profileSettings(profile as "mira" | "luke"), revision: 1 }));
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubGlobal("fetch", vi.fn(async (input: URL, options: RequestInit) => {
    expect(options.cache).toBe("no-store");
    if (options.method === "PATCH") {
      const profile = input.searchParams.get("profile")?.slice(3);
      const revision = Number(input.searchParams.get("revision")?.slice(3));
      const row = rows.find(row => row.profile === profile && row.revision === revision);
      if (!row) return Response.json([]);
      Object.assign(row, JSON.parse(options.body as string));
      return Response.json([row]);
    }
    return Response.json(rows);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("reads uncached settings without exposing credentials", async () => {
  const response = await GET();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ profiles: rows.map(row => ({ ...row, kind: row.profile })) });
});
it("updates only the selected profile and refuses stale revisions", async () => {
  const settings = { ...profileSettings("mira"), intervalMinutes: 15 };
  const saved = await PUT(request({ profile: "mira", settings, revision: 1 }));
  expect(saved.status).toBe(200);
  expect((await saved.json()).saved).toMatchObject({ revision: 2, settings });
  expect(rows[1]).toMatchObject({ profile: "luke", revision: 1, settings: { intervalMinutes: 5 } });
  const stale = await PUT(request({ profile: "mira", settings: profileSettings("mira"), revision: 1 }));
  expect(stale.status).toBe(409);
  expect((await stale.json()).profiles[0].settings.intervalMinutes).toBe(15);
});
it.each([
  { profile: "Unknown!" }, { revision: 0 }, { revision: 1.2 },
  { settings: { ...profileSettings("mira"), enabledGames: ["cars"] } },
  { settings: { ...profileSettings("mira"), enabledGames: [] } },
  { settings: { ...profileSettings("mira"), intervalMinutes: 100 } },
  { settings: { ...profileSettings("mira"), soundEnabled: "yes" } },
])("rejects invalid input %j", async override => {
  expect((await PUT(request({ profile: "mira", settings: profileSettings("mira"), revision: 1, ...override }))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects cross-origin writes and oversized streaming bodies", async () => {
  expect((await PUT(request({}, "https://elsewhere.test"))).status).toBe(403);
  expect((await PUT(request({ data: "x".repeat(5000) }))).status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it("reports outages instead of claiming an unsuccessful save succeeded", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("private database details"));
  const response = await PUT(request({ profile: "mira", settings: profileSettings("mira"), revision: 1 }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database");
  expect((await GET()).status).toBe(503);
});

it("withholds toddler IDs from old clients without changing the stored settings", async () => {
  rows[1].settings.enabledGames = ["car-voices", "car-hide"];
  const legacy = await (await GET()).json();
  expect(legacy.profiles[1].settings.enabledGames).toEqual([]);
  expect(legacy.profiles[1].settings.learningEnabled).toBe(false);
  const modern = await (await GET(familyRequest("https://app.test/api/profile-settings", { headers: { "X-Game-Schema": "2" } }))).json();
  expect(modern.profiles[1].settings.enabledGames).toEqual(["car-voices", "car-hide"]);
  expect(rows[1].settings.enabledGames).toEqual(["car-voices", "car-hide"]);
});

it("prevents an old tab from saving its reduced game list over the family's settings", async () => {
  const response = await PUT(familyRequest("https://app.test/api/profile-settings", {
    method: "PUT", headers: { origin: "https://app.test" },
    body: JSON.stringify({ profile: "luke", settings: profileSettings("luke"), revision: 1 }),
  }));
  expect(response.status).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
});
