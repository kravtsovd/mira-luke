import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as REPORT } from "../app/family/report/[file]/route";
import { newSession, signValue } from "../app/lib/auth";
import {
  clearReportCache, embeddedData, isoUtc, parseInstant, pyRound, reportHeader, reportQuery, reportWindow, shapeReport, watchPeriods, withData, withNotice,
} from "../app/lib/family-report-data";

const SECTIONS = ["events_total", "hosts_seen", "daily_profile", "games", "completion_speed", "daily_games", "round_events", "game_builds",
  "silent_sessions", "watch_samples", "daily_videos", "answer_method", "videos", "errors", "error_samples", "ux", "dead_click_targets",
  "no_results_search", "devices"];
const sections = (data: Record<string, unknown[][]>) => SECTIONS.map(name => [name, JSON.stringify(data[name] ?? [])]);

// [ts, event, p, g, sec, att, os, b, sid, c, t, variant, level, name_id, step_sec, step_errors, next_level, mastered, clean, mistakes,
//  stars_before, stars_after, test_mode, streak_after, level_up_reason, level_clean_rounds, level_miss_rounds]
const ev = (ts: string, event: string, p: string, g: string, extra: Record<number, unknown> = {}) => {
  const row: unknown[] = [ts, event, p, g, null, null, "iOS", "b1", "s1", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  for (const [index, value] of Object.entries(extra)) row[Number(index)] = value;
  return row;
};
const DAY = "2026-10-10";
// 17:00 UTC = 10:00 in Los Angeles; 09:00 UTC = 02:00, when the children are asleep.
const play = [
  ev("2026-10-10 17:00:00.000000", "game_opened", "mira", "huntrix", { 10: "watch_timer" }),
  ev("2026-10-10 17:00:01.000000", "game_started", "mira", "huntrix-syllables"),
  ev("2026-10-10 17:00:05.000000", "game_answered", "mira", "huntrix-syllables", { 9: "false" }),
  ev("2026-10-10 17:00:09.000000", "game_answered", "mira", "huntrix-syllables", { 9: "true" }),
  ev("2026-10-10 17:00:10.000000", "game_completed", "mira", "huntrix-syllables", { 4: 9, 5: 2 }),
  // Opened from the games button: an adult testing, not Mira's play.
  ev("2026-10-10 17:10:00.000000", "game_opened", "mira", "huntrix", { 10: "games_button" }),
  ev("2026-10-10 17:10:01.000000", "game_started", "mira", "huntrix-syllables"),
  ev("2026-10-10 17:10:04.000000", "game_answered", "mira", "huntrix-syllables", { 9: "true" }),
  ev("2026-10-10 17:10:05.000000", "game_completed", "mira", "huntrix-syllables", { 4: 4, 5: 1 }),
  ev("2026-10-10 09:00:00.000000", "game_opened", "mira", "huntrix", { 10: "watch_timer" }),
  ev("2026-10-10 09:00:01.000000", "game_started", "mira", "huntrix-syllables"),
  ev("2026-10-10 09:00:03.000000", "game_abandoned", "mira", "huntrix-syllables", { 4: 2 }),
];
const fixture = () => sections({
  events_total: [["game_answered", 3], ["game_completed", 2]],
  daily_profile: [[DAY, "mira", 3, 2, 2, 1, 3, 1]],
  games: [["huntrix-syllables", "mira", 3, 2, 1, 0, 3, 2, 6.5, 6.5, 1.5, 8.5, 2]],
  daily_games: [[DAY, "mira", "huntrix-syllables", 3, 2, 6.5, 6.5, 3, 2]],
  completion_speed: [["mira", "huntrix-syllables", 4, 1, "2026-10-10 17:10:05.000000"], ["mira", "huntrix-syllables", 9, 2, "2026-10-10 17:00:10.000000"]],
  round_events: play,
  // Two minutes, then one minute after a 20-minute gap: two viewing periods, three minutes in total.
  watch_samples: [["2026-10-10 18:00:00.000000", "mira", "s1", 120], ["2026-10-10 18:21:00.000000", "mira", "s1", 60]],
});
const header = () => reportHeader(reportWindow(new Date("2026-10-12T18:00:00Z")));
const shape = (rows = fixture()) => shapeReport(header(), rows, { retrievedAt: new Date("2026-10-12T18:00:05Z"), titles: {}, englishProgress: { status: "ok" } });

describe("window and query", () => {
  it("covers thirty local days from midnight, across a daylight-saving change", () => {
    const summer = reportWindow(new Date("2026-10-12T18:00:00.900Z"));
    expect(summer.startSql).toBe("2026-09-13 07:00:00");
    expect(summer.endSql).toBe("2026-10-12 18:00:00");
    // 2026-11-01 ends daylight saving: a window reaching back over it starts at 07:00 UTC, one ending after it at 08:00.
    expect(reportWindow(new Date("2026-11-20T12:00:00Z")).startSql).toBe("2026-10-22 07:00:00");
    expect(reportWindow(new Date("2026-12-20T12:00:00Z")).startSql).toBe("2026-11-21 08:00:00");
  });

  it("reads only the family's children and drops anything that is not a profile id", () => {
    const sql = reportQuery(["mira", "luke", "x') OR 1=1 --"], reportWindow(new Date("2026-10-12T18:00:00Z")));
    expect(sql).toContain("(properties.profile IN ('mira','luke') OR properties.profile IS NULL)");
    expect(sql).not.toContain("1=1");
    expect(sql.split("UNION ALL")).toHaveLength(SECTIONS.length);
    expect(() => reportQuery([], reportWindow())).toThrow();
  });
});

describe("Python number and time semantics", () => {
  it("rounds like Python: exact binary value, ties to even", () => {
    expect(pyRound(0.25, 1)).toBe(0.2);
    expect(pyRound(0.75, 1)).toBe(0.8);
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyRound(6.55, 1)).toBe(6.5);
    expect(pyRound(-1.25, 1)).toBe(-1.2);
    expect(pyRound(3, 1)).toBe(3);
  });

  it("prints instants like datetime.isoformat", () => {
    const at = parseInstant("2026-10-12 15:38:30.171000");
    expect(isoUtc(at)).toBe("2026-10-12T15:38:30.171000+00:00");
    expect(isoUtc(at, "milliseconds")).toBe("2026-10-12T15:38:30.171+00:00");
    expect(isoUtc(at, "seconds")).toBe("2026-10-12T15:38:30+00:00");
    expect(isoUtc(parseInstant("2026-10-12T15:38:30Z"))).toBe("2026-10-12T15:38:30+00:00");
    expect(parseInstant("2026-10-12T08:38:30-07:00")).toBe(parseInstant("2026-10-12 15:38:30"));
  });

  it("splits viewing where the gap is over ten minutes and never starts before local midnight", () => {
    const periods = watchPeriods([["2026-10-10 07:00:30.000000", "luke", "s9", 90]]);
    expect(periods).toEqual([["2026-10-10", "luke", "2026-10-10T07:00:00+00:00", "2026-10-10T07:00:30+00:00", 1.5]]);
  });
});

describe("shaping", () => {
  it("counts only rounds the cartoon timer opened, outside the night", () => {
    const data = shape();
    expect(data.rounds_excluded).toEqual({ night: 1, flip: 0, manual: 1, english_test_mode: 0 });
    expect(data.rounds).toEqual([[DAY, "mira", "huntrix-syllables", 9, 2, "completed", true, "iOS", "b1", "2026-10-10T17:00:10+00:00", 2, 1, null, null]]);
    expect(data.daily_games).toEqual([[DAY, "mira", "huntrix-syllables", 1, 1, 9, 9, 2, 1]]);
    expect(data.daily_profile[0].slice(2, 5)).toEqual([2, 1, 1]);
    // The adult's completion leaves the speed chart too.
    expect(data.completion_speed.map((row: unknown[]) => row[4])).toEqual(["2026-10-10T17:00:10.000+00:00"]);
    expect(data.watch_periods.map((row: unknown[]) => row[4])).toEqual([2, 1]);
    expect(data.name_levels).toEqual([["mira", "unknown", 1, 1, 1, 9, 1, 0]]);
    expect(data.retrieval_method).toBe("PostHog query API");
    expect(data.round_events).toBeUndefined();
    expect(data.watch_samples).toBeUndefined();
  });

  it("refuses partial or inconsistent data instead of showing wrong numbers", () => {
    expect(() => shape(fixture().slice(1))).toThrow(/sections/);
    const rows = fixture();
    rows[SECTIONS.indexOf("daily_profile")][1] = JSON.stringify([[DAY, "mira", 3, 2, 2, 1, 5, 1]]);
    expect(() => shape(rows)).toThrow(/Viewing periods/);
  });

  it("puts fresh data into the stored page without letting it close the script", () => {
    const page = `<html><script id="data" type="application/json">{"titles":{"abc":{"title":"Old"}}}</script><script>render()</script></html>`;
    expect(embeddedData(page)?.titles.abc.title).toBe("Old");
    const fresh = withData(page, { note: "</script><script>alert(1)</script>" })!;
    expect(fresh).toContain("<script>render()</script>");
    expect(fresh.match(/<\/script>/g)).toHaveLength(2);
    expect(embeddedData(fresh)).toEqual({ note: "</script><script>alert(1)</script>" });
    expect(withData("<html>no data</html>", {})).toBeNull();
  });

  it("says how fresh the numbers are, just before the page's closing body tag", () => {
    const page = `<html><body><script>var s = "</body>";</script><script id="data" type="application/json">{"generated_at":"2026-10-12T17:02:00+00:00"}</script></body></html>`;
    const shown = withNotice(page, "snapshot");
    expect(shown.indexOf("report-freshness")).toBeGreaterThan(shown.indexOf('id="data"'));
    expect(shown).toMatch(/10:02\.<\/div><script>if \(location.search\)/);
    expect(withNotice(page, "live")).toContain("Свежие данные PostHog");
  });
});

describe("the page", () => {
  const stored = `<html><script id="data" type="application/json">{"generated_at":"old"}</script></html>`;
  const cookie = () => `ml_session=${encodeURIComponent(signValue(newSession("p@example.test", "demo")))}`;
  const open = (query = "?data=live") => REPORT(new Request(`https://app.test/family/report/viewer.html${query}`, { headers: { cookie: cookie() } }), { params: Promise.resolve({ file: "viewer.html" }) });
  let posthog: (url: string, init?: RequestInit) => Response;
  // PostHog's async query: the POST starts it, the first poll says "running", the second carries the results.
  const asyncPostHog = (results: unknown) => {
    let polls = 0;
    return (url: string, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ query_status: { id: "q1", complete: false } }, { status: 202 })
      : ++polls < 2 ? Response.json({ query_status: { id: "q1", complete: false } }, { status: 202 })
        : Response.json({ query_status: { id: "q1", complete: true, results: { results } } });
  };

  beforeEach(() => {
    clearReportCache();
    vi.stubEnv("SUPABASE_URL", "https://db.test"); vi.stubEnv("SUPABASE_SECRET_KEY", "k"); vi.stubEnv("AUTH_SESSION_SECRET", "x".repeat(40));
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx_test");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("posthog.com")) return posthog(url, init);
      if (url.includes("family_reports")) return Response.json([{ html: stored }]);
      if (url.includes("profile_settings")) return Response.json([{ profile: "mira" }, { profile: "luke" }]);
      if (url.includes("game_progress") || url.includes("youtube.com")) return new Response("", { status: 404 });
      return Response.json([]);
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  const posthogCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("posthog.com"));
  const saves = () => vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).includes("family_reports") && init?.method === "PATCH");

  it("opens at once with the saved numbers and reloads itself with fresh ones", async () => {
    posthog = asyncPostHog(fixture());
    const response = await open("");
    expect(response.headers.get("x-report-data")).toBe("pending");
    const body = await response.text();
    expect(embeddedData(body)).toEqual({ generated_at: "old" });
    expect(body).toContain('location.replace(location.pathname + "?data=live")');
    expect(body).toContain("Загружаю свежие из PostHog");
    expect(posthogCalls()).toHaveLength(0);
  });

  it("reads PostHog, saves the fresh numbers into both pages, then serves them for ten minutes", async () => {
    posthog = asyncPostHog(fixture());
    const response = await open();
    expect(response.headers.get("x-report-data")).toBe("live");
    const data = embeddedData(await response.text())!;
    expect(data.rounds).toHaveLength(1);
    expect(data.generated_at).not.toBe("old");
    const start = posthogCalls().find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse((start[1] as RequestInit).body as string);
    expect(body.refresh).toBe("force_async");
    expect(body.query.query).toContain("properties.profile IN ('mira','luke')");
    expect(posthogCalls().filter(([url]) => String(url).endsWith("/query/q1/"))).toHaveLength(2);
    expect(saves().map(([url]) => new URL(String(url)).searchParams.get("name"))).toEqual(["eq.viewer.html", "eq.skill-tree.html"]);
    for (const [, init] of saves()) {
      const saved = JSON.parse((init as RequestInit).body as string);
      expect(embeddedData(saved.html)!.generated_at).toBe(data.generated_at);
      expect(saved.html).not.toContain("report-freshness");
      expect(saved.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The other page of the pair opens straight away from the same numbers, without a second read or save.
    const again = await open("");
    expect(again.headers.get("x-report-data")).toBe("live");
    expect(posthogCalls().filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(saves()).toHaveLength(2);
  }, 15_000);

  it("keeps the stored numbers when PostHog fails", async () => {
    posthog = (url, init) => init?.method === "POST" ? Response.json({ query_status: { id: "q1", complete: false } }, { status: 202 })
      : Response.json({ query_status: { id: "q1", complete: true, error: true, error_message: "max execution time" } });
    const response = await open();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-report-data")).toBe("snapshot");
    const body = await response.text();
    expect(embeddedData(body)).toEqual({ generated_at: "old" });
    expect(body).toContain("Не удалось получить свежие данные из PostHog");
    expect(body).not.toContain("location.replace");
    expect(saves()).toHaveLength(0);
    posthog = () => new Response("busy", { status: 503 });
    expect((await open()).headers.get("x-report-data")).toBe("snapshot");
  });
});
