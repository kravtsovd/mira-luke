import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as STATS } from "../app/api/family/stats/route";
import { newSession, signValue } from "../app/lib/auth";
import { clearStatsCache, playedRounds, shapeStats, statsQuery, statsWindow } from "../app/lib/family-stats";

const ORIGIN = "https://app.test";
const signedIn = (email: string, familyId: string) => `ml_session=${encodeURIComponent(signValue(newSession(email, familyId)))}`;
const get = (cookie = "") => new Request(`${ORIGIN}/api/family/stats`, { headers: cookie ? { cookie } : {} });

// [ts, event, profile, game, session, trigger, seconds, attempts, correct, test_mode]
const opened = (ts: string, profile: string, trigger: string, sid = "s1") => [ts, "game_opened", profile, "huntrix", sid, trigger, null, null, null, null];
const started = (ts: string, profile: string, game: string, sid = "s1", testMode: unknown = null) => [ts, "game_started", profile, game, sid, null, null, null, null, testMode];
const answered = (ts: string, profile: string, game: string, correct: boolean, sid = "s1", testMode: unknown = null) => [ts, "game_answered", profile, game, sid, null, null, null, String(correct), testMode];
const completed = (ts: string, profile: string, game: string, seconds: number, sid = "s1", testMode: unknown = null) => [ts, "game_completed", profile, game, sid, null, seconds, 1, null, testMode];

describe("statistics window", () => {
  it("starts at local midnight in summer and winter", () => {
    const summer = statsWindow(new Date("2026-10-11T21:00:00Z"));
    expect(summer.dates).toHaveLength(14);
    expect(summer.dates[0]).toBe("2026-09-28");
    expect(summer.dates[13]).toBe("2026-10-11");
    expect(summer.start.toISOString()).toBe("2026-09-28T07:00:00.000Z");
    expect(statsWindow(new Date("2026-12-20T12:00:00Z")).start.toISOString()).toBe("2026-12-07T08:00:00.000Z");
  });
});

describe("statistics query", () => {
  it("reads only the given children on production hosts", () => {
    const sql = statsQuery(["mira", "luke"], new Date("2026-09-28T07:00:00Z"));
    expect(sql).toContain("properties.profile IN ('mira', 'luke')");
    expect(sql).toContain("properties.$host IN ('localhost', '127.0.0.1')");
    expect(sql).toContain("toDateTime('2026-09-28 07:00:00', 'UTC')");
  });

  it("drops ids that are not profile ids, so nothing can be injected", () => {
    const sql = statsQuery(["mira", "x') OR 1=1 --"], new Date());
    expect(sql).toContain("properties.profile IN ('mira')");
    expect(sql).not.toContain("OR 1=1");
    expect(() => statsQuery(["'bad'"], new Date())).toThrow();
  });
});

describe("played rounds", () => {
  it("counts only daytime rounds the cartoon timer opened", () => {
    const rounds = playedRounds([
      opened("2026-10-10 17:00:00", "luke", "watch_timer"),
      started("2026-10-10 17:00:01", "luke", "cars"),
      answered("2026-10-10 17:00:05", "luke", "cars", false),
      answered("2026-10-10 17:00:08", "luke", "cars", true),
      completed("2026-10-10 17:00:09", "luke", "cars", 8),
      opened("2026-10-10 18:00:00", "luke", "manual"),
      started("2026-10-10 18:00:01", "luke", "cars"),
      completed("2026-10-10 18:00:09", "luke", "cars", 8),
      opened("2026-10-10 09:00:00", "luke", "watch_timer", "night"),
      started("2026-10-10 09:00:01", "luke", "cars", "night"),
      completed("2026-10-10 09:00:09", "luke", "cars", 8, "night"),
      opened("2026-10-10 19:00:00", "luke", "watch_timer", "flip"),
      started("2026-10-10 19:00:01", "luke", "cars", "flip"),
      ["2026-10-10 19:00:03", "game_abandoned", "luke", "cars", "flip", null, 2, 0, null, null],
    ]);
    expect(rounds).toEqual([{ date: "2026-10-10", at: "2026-10-10T17:00:09.000Z", profile: "luke", game: "cars", completed: true, seconds: 8, answers: 2, wrong: 1 }]);
  });

  it("keeps a last answer that shares its millisecond with the completion", () => {
    // Luke's car-hide round of 2026-10-04: the winning tap and game_completed carry the same timestamp.
    const ts = "2026-10-04 16:47:03.725000";
    const rounds = playedRounds([
      opened("2026-10-04 16:46:38.770000", "luke", "watch_timer"),
      started("2026-10-04 16:46:38.814000", "luke", "car-hide"),
      [...answered("2026-10-04 16:47:01.401000", "luke", "car-hide", false), "01a107cf-ccee-7775-9fab-40fd2ae6400b"],
      [...completed(ts, "luke", "car-hide", 25), "01a107cf-d602-793e-b9b7-c59a911f5fc8"],
      [...answered(ts, "luke", "car-hide", true), "01a107cf-d602-793e-b9b7-c599f53c6297"],
    ]);
    expect(rounds).toMatchObject([{ game: "car-hide", completed: true, answers: 2, wrong: 1 }]);
  });

  it("keeps English rounds only when every event says test_mode is false", () => {
    const rounds = playedRounds([
      opened("2026-10-10 17:00:00", "mira", "watch_timer"),
      started("2026-10-10 17:00:01", "mira", "english-find", "s1", false),
      completed("2026-10-10 17:00:09", "mira", "english-find", 8, "s1", false),
      opened("2026-10-10 17:10:00", "mira", "watch_timer", "s2"),
      started("2026-10-10 17:10:01", "mira", "english-find", "s2", false),
      completed("2026-10-10 17:10:09", "mira", "english-find", 8, "s2", true),
    ]);
    expect(rounds.map(round => round.at)).toEqual(["2026-10-10T17:00:09.000Z"]);
  });
});

describe("statistics shape", () => {
  it("builds totals, days, games and videos for the given children only", () => {
    const now = new Date("2026-10-11T21:00:00Z");
    const { dates } = statsWindow(now);
    const events = [
      opened("2026-10-10 17:00:00", "luke", "watch_timer"), started("2026-10-10 17:00:01", "luke", "cars"),
      answered("2026-10-10 17:00:05", "luke", "cars", true), completed("2026-10-10 17:00:09", "luke", "cars", 12),
      opened("2026-10-01 17:00:00", "luke", "watch_timer", "old"), started("2026-10-01 17:00:01", "luke", "cars", "old"),
      answered("2026-10-01 17:00:05", "luke", "cars", false, "old"), answered("2026-10-01 17:00:15", "luke", "cars", true, "old"),
      completed("2026-10-01 17:00:30", "luke", "cars", 30, "old"),
      opened("2026-10-10 17:00:00", "stranger", "watch_timer"), started("2026-10-10 17:00:01", "stranger", "cars"),
      completed("2026-10-10 17:00:09", "stranger", "cars", 5),
    ];
    const rows = [
      ["daily", JSON.stringify([["2026-10-10", "luke", 42.5, 3], ["2026-10-10", "stranger", 99, 9], ["2026-01-01", "luke", 5, 1]])],
      ["videos", JSON.stringify([["luke", "aaaaaaaaaaa", 30, 2], ["stranger", "bbbbbbbbbbb", 99, 9]])],
      ["rounds", JSON.stringify(events)],
    ];
    const stats = shapeStats(rows, ["mira", "luke"], dates, new Map([["aaaaaaaaaaa", "Song"]]), now);
    expect(stats.children.map(child => child.profile)).toEqual(["mira", "luke"]);
    const [mira, luke] = stats.children;
    expect(mira).toMatchObject({ minutes: 0, rounds: 0, games: [], videos: [] });
    expect(luke.minutes).toBe(42.5);
    expect(luke.rounds).toBe(2);
    expect(luke.days.find(day => day.date === "2026-10-10")).toMatchObject({ minutes: 42.5, videos: 3, rounds: 1, answers: 1, correct: 1 });
    expect(luke.games).toEqual([{
      game: "cars", title: "Подбери гараж по цвету", rounds: 2, answers: 3, accuracy: 0.67, errorsPerRound: 0.5,
      recentSeconds: 12, earlierSeconds: 30, daysPlayed: 2, lastPlayed: "2026-10-10T17:00:09.000Z",
    }]);
    expect(luke.videos).toEqual([{ id: "aaaaaaaaaaa", title: "Song", minutes: 30, starts: 2 }]);
  });
});

describe("statistics route", () => {
  let queries: string[];
  beforeEach(() => {
    clearStatsCache();
    queries = [];
    vi.stubEnv("SUPABASE_URL", "https://db.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("AUTH_SESSION_SECRET", "x".repeat(40));
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      if (url.host === "db.test" && url.pathname === "/rest/v1/profile_settings") {
        const family = url.searchParams.get("family_id");
        return Response.json(family === "eq.petrov" ? [{ profile: "c-charlotte0" }] : [{ profile: "mira" }, { profile: "luke" }]);
      }
      if (url.host === "us.posthog.com") {
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer phx_test");
        queries.push(JSON.parse(String(init.body)).query.query);
        return Response.json({ results: [["daily", "[]"], ["videos", "[]"], ["rounds", "[]"]] });
      }
      return new Response("not found", { status: 404 });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("asks a signed-out visitor to sign in", async () => {
    const response = await STATS(get());
    expect(response.status).toBe(401);
    expect(queries).toEqual([]);
  });

  it("queries only the signed-in parent's children", async () => {
    const response = await STATS(get(signedIn("jean@example.test", "petrov")));
    expect(response.status).toBe(200);
    expect((await response.json()).children.map((child: { profile: string }) => child.profile)).toEqual(["c-charlotte0"]);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("properties.profile IN ('c-charlotte0')");
    expect(queries[0]).not.toContain("'mira'");
  });

  it("caches a family's statistics between panel openings", async () => {
    await STATS(get(signedIn("dad@example.test", "demo")));
    await STATS(get(signedIn("mom@example.test", "demo")));
    expect(queries).toHaveLength(1);
  });

  it("says plainly when the PostHog key is not set", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
    const response = await STATS(get(signedIn("dad@example.test", "demo")));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "not_configured" });
  });

  it("hides PostHog failures behind a short message", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => new URL(String(input)).host === "db.test"
      ? Response.json([{ profile: "mira" }]) : new Response("boom", { status: 500 })));
    const response = await STATS(get(signedIn("dad@example.test", "demo")));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("boom");
  });
});
