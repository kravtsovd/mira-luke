import "server-only";

import { VIDEOS } from "@/app/data/catalog";
import { fetchCatalogSnapshot } from "@/app/lib/catalog-store";
import { GAME_LABELS } from "@/app/lib/game-labels";
import { isProfileId } from "@/app/lib/profiles";

export const STATS_DAYS = 14;
const ZONE = process.env.APP_TIMEZONE || "UTC";
// The app marks every other host as is_test, so production is selected by host, not by that flag.
const PROD_HOSTS = (process.env.ANALYTICS_ALLOWED_HOSTS || "localhost,127.0.0.1").split(",").map(host => host.trim()).filter(host => /^[a-zA-Z0-9.:-]+$/.test(host));
const CACHE_MS = 10 * 60 * 1000;
// Parent-facing names say what the game trains; the same names as the family usage dashboard.
const GAME_TITLES: Record<string, string> = {
  "huntrix-syllables": "Собери имя из слогов", huntrix: "Узнай героя по имени", "english-find": "Find it! Английский на слух",
  "car-hide": "Запомни гараж", "car-people": "Найди столько же машинок", "car-voices": "Узнай машинку на слух",
  "car-workshop": "Найди деталь машинки", "luke-count": "Люки и машинки", cars: "Подбери гараж по цвету",
};
const gameTitle = (game: string) => GAME_TITLES[game] ?? GAME_LABELS[game as keyof typeof GAME_LABELS]?.title ?? game;

export interface DayStats { date: string; minutes: number; videos: number; rounds: number; answers: number; correct: number }
export interface GameStats {
  game: string; title: string; rounds: number; answers: number; accuracy: number | null; errorsPerRound: number | null;
  recentSeconds: number | null; earlierSeconds: number | null; daysPlayed: number; lastPlayed: string | null;
}
export interface VideoStats { id: string; title: string | null; minutes: number; starts: number }
export interface ChildStats { profile: string; minutes: number; rounds: number; days: DayStats[]; games: GameStats[]; videos: VideoStats[] }
export interface FamilyStats { generatedAt: string; days: number; timezone: string; children: ChildStats[] }

export class StatsUnavailable extends Error {
  constructor(readonly reason: "not_configured" | "upstream") { super(reason); }
}

/** Local calendar dates of the window, oldest first, and the UTC instant where the first one starts. */
export function statsWindow(now = new Date(), days = STATS_DAYS) {
  const dateIn = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  const dates: string[] = [];
  for (let back = days - 1; back >= 0; back -= 1) dates.push(dateIn(new Date(now.getTime() - back * 86400000)));
  // Midnight of the first date in the zone: start from UTC midnight and walk back by the zone's offset that day.
  const [y, m, d] = dates[0].split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utcMidnight));
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find(part => part.type === "minute")?.value ?? 0);
  const offsetMinutes = hour * 60 + minute > 12 * 60 ? 24 * 60 - (hour * 60 + minute) : -(hour * 60 + minute);
  const start = new Date(utcMidnight + offsetMinutes * 60000);
  return { dates, start };
}

const sqlTime = (instant: Date) => instant.toISOString().slice(0, 19).replace("T", " ");

/** One HogQL statement that returns (section, JSON payload) rows for the given children. */
export function statsQuery(children: string[], start: Date): string {
  const ids = children.filter(isProfileId);
  if (ids.length === 0) throw new Error("No children");
  const list = (values: string[]) => values.map(value => `'${value}'`).join(", ");
  const base = `timestamp >= toDateTime('${sqlTime(start)}', 'UTC') AND properties.$host IN (${list(PROD_HOSTS)}) AND properties.profile IN (${list(ids)})`;
  return `
SELECT 'daily' AS section, toJSONString(groupArray(tuple(d, p, minutes, videos))) AS payload FROM (
  SELECT toString(toDate(toTimeZone(timestamp, '${ZONE}'))) AS d, toString(properties.profile) AS p,
         round(sumIf(toFloat(properties.watched_seconds), event = 'video_watch_time') / 60, 1) AS minutes,
         countIf(event = 'video_started') AS videos
  FROM events WHERE ${base} AND event IN ('video_started', 'video_watch_time') GROUP BY d, p)
UNION ALL
SELECT 'videos' AS section, toJSONString(groupArray(tuple(p, v, minutes, starts))) AS payload FROM (
  SELECT toString(properties.profile) AS p, toString(properties.video_id) AS v,
         round(sumIf(toFloat(properties.watched_seconds), event = 'video_watch_time') / 60, 1) AS minutes,
         countIf(event = 'video_started') AS starts
  FROM events WHERE ${base} AND event IN ('video_started', 'video_watch_time') AND properties.video_id IS NOT NULL
  GROUP BY p, v ORDER BY minutes DESC LIMIT 300)
UNION ALL
SELECT 'rounds' AS section, toJSONString(groupArray(tuple(ts, e, p, g, sid, tr, sec, att, ok, tm, id))) AS payload FROM (
  SELECT toString(toTimeZone(timestamp, 'UTC')) AS ts, event AS e, toString(properties.profile) AS p, toString(properties.game) AS g,
         toString($session_id) AS sid, toString(properties.trigger) AS tr, toFloat(properties.duration_seconds) AS sec,
         toFloat(properties.attempts) AS att, toString(properties.correct) AS ok, toString(properties.test_mode) AS tm, toString(uuid) AS id
  FROM events WHERE ${base}
    AND event IN ('game_opened', 'game_started', 'game_answered', 'game_round_scored', 'game_completed', 'game_abandoned')
  ORDER BY timestamp, uuid LIMIT 50000)`;
}

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : Number(value) || 0);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const instant = (value: unknown) => new Date(`${String(value).replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(String(value)) ? "" : "Z"}`);
const localDate = (when: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
const localHour = (when: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour12: false, hour: "2-digit" }).format(when)) % 24;
const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
};

export interface PlayedRound { date: string; at: string; profile: string; game: string; completed: boolean; seconds: number | null; answers: number; wrong: number }

/**
 * Rebuilds rounds from raw game events with the usage dashboard's rules, so both show the same play:
 * only games the cartoon timer opened count as the child's play (the maintainer, 2026-09-30; games-button rounds are adults
 * testing), rounds closed 00:00-06:00 are adults checking a release, a round dropped within 5 s with no answer is a
 * flip, and an English round counts only when every event says test_mode=false (practice never moves Mira's stars).
 */
export function playedRounds(events: unknown[][]): PlayedRound[] {
  type Open = { trigger: string | null; answers: number; wrong: number; testFlags: string[] };
  const lastOpen = new Map<string, string | null>();
  const open = new Map<string, Open>();
  const rounds: PlayedRound[] = [];
  const fresh = (): Open => ({ trigger: null, answers: 0, wrong: 0, testFlags: [] });
  // A round's last answer and its completion often share one millisecond (2026-10-04 16:47:03.725, Luke's car-hide):
  // ordered by time alone the completion could come first and drop that answer. Event ids are UUIDv7, which grow in
  // emission order, so they break the tie; rows are re-sorted here because groupArray does not promise query order.
  const ordered = [...events].sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[10] ?? "").localeCompare(String(b[10] ?? "")));
  for (const [ts, event, profile, game, session, trigger, seconds, attempts, correct, testMode] of ordered) {
    const p = String(profile), g = String(game ?? ""), sid = String(session ?? "");
    const key = `${sid}|${p}|${g}`;
    if (event === "game_opened") { lastOpen.set(`${sid}|${p}`, trigger === null || trigger === undefined ? null : String(trigger)); continue; }
    if (!g || g === "null") continue;
    if (event === "game_started") {
      const state = fresh();
      state.trigger = lastOpen.get(`${sid}|${p}`) ?? null;
      lastOpen.delete(`${sid}|${p}`);
      if (g === "english-find") state.testFlags.push(String(testMode).toLowerCase());
      open.set(key, state);
      continue;
    }
    const state = open.get(key) ?? fresh();
    if (!open.has(key)) open.set(key, state);
    if (g === "english-find") state.testFlags.push(String(testMode).toLowerCase());
    if (event === "game_answered") {
      state.answers += 1;
      if (!["true", "1"].includes(String(correct).toLowerCase())) state.wrong += 1;
      continue;
    }
    if (event !== "game_completed" && event !== "game_abandoned") continue;
    open.delete(key);
    const at = instant(ts);
    const sec = seconds === null || seconds === undefined || !Number.isFinite(Number(seconds)) ? null : Number(seconds);
    if (localHour(at) < 6) continue;
    if (event === "game_abandoned" && !num(attempts) && (sec ?? 0) < 5) continue;
    if (state.trigger !== "watch_timer") continue;
    if (g === "english-find" && (state.testFlags.length === 0 || state.testFlags.some(flag => flag !== "false"))) continue;
    rounds.push({ date: localDate(at), at: at.toISOString(), profile: p, game: g, completed: event === "game_completed", seconds: sec, answers: state.answers, wrong: state.wrong });
  }
  return rounds;
}

/** Turns the PostHog rows into per-child statistics; children keep the order they were given in. */
export function shapeStats(rows: unknown[][], children: string[], dates: string[], titles: Map<string, string>, now = new Date()): FamilyStats {
  const sections = new Map<string, unknown[][]>();
  for (const [section, payload] of rows) {
    try { sections.set(String(section), JSON.parse(String(payload)) as unknown[][]); } catch { sections.set(String(section), []); }
  }
  const result: ChildStats[] = children.map(profile => ({
    profile, minutes: 0, rounds: 0,
    days: dates.map(date => ({ date, minutes: 0, videos: 0, rounds: 0, answers: 0, correct: 0 })), games: [], videos: [],
  }));
  const byProfile = new Map(result.map(child => [child.profile, child]));
  const dayOf = (profile: string, date: string) => byProfile.get(profile)?.days.find(entry => entry.date === date);
  for (const [date, profile, minutes, videos] of sections.get("daily") ?? []) {
    const day = dayOf(String(profile), String(date));
    if (day) Object.assign(day, { minutes: round(num(minutes)), videos: num(videos) });
  }
  const recentFrom = new Date(now.getTime() - 7 * 86400000).toISOString();
  const games = new Map<string, { child: ChildStats; game: string; rounds: PlayedRound[] }>();
  for (const played of playedRounds(sections.get("rounds") ?? [])) {
    const child = byProfile.get(played.profile);
    if (!child) continue;
    const day = dayOf(played.profile, played.date);
    if (day) {
      day.answers += played.answers;
      day.correct += played.answers - played.wrong;
      if (played.completed) day.rounds += 1;
    }
    const key = `${played.profile}|${played.game}`;
    if (!games.has(key)) games.set(key, { child, game: played.game, rounds: [] });
    games.get(key)!.rounds.push(played);
  }
  for (const { child, game, rounds } of games.values()) {
    const done = rounds.filter(entry => entry.completed);
    const answers = rounds.reduce((sum, entry) => sum + entry.answers, 0);
    const wrong = rounds.reduce((sum, entry) => sum + entry.wrong, 0);
    const timed = (recent: boolean) => done.filter(entry => entry.seconds !== null && (entry.at >= recentFrom) === recent).map(entry => entry.seconds as number);
    child.games.push({
      game, title: gameTitle(game), rounds: done.length, answers,
      accuracy: answers > 0 ? round((answers - wrong) / answers, 2) : null,
      errorsPerRound: done.length > 0 ? round(done.reduce((sum, entry) => sum + entry.wrong, 0) / done.length) : null,
      recentSeconds: median(timed(true)), earlierSeconds: median(timed(false)),
      daysPlayed: new Set(rounds.map(entry => entry.date)).size, lastPlayed: rounds.reduce<string | null>((latest, entry) => (latest && latest > entry.at ? latest : entry.at), null),
    });
  }
  for (const child of result) {
    child.games.sort((a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""));
    child.minutes = round(child.days.reduce((sum, day) => sum + day.minutes, 0));
    child.rounds = child.days.reduce((sum, day) => sum + day.rounds, 0);
  }
  for (const [profile, video, minutes, starts] of sections.get("videos") ?? []) {
    const child = byProfile.get(String(profile));
    if (!child || !video || child.videos.length >= 5) continue;
    if (num(minutes) <= 0 && num(starts) <= 0) continue;
    child.videos.push({ id: String(video), title: titles.get(String(video)) ?? null, minutes: round(num(minutes)), starts: num(starts) });
  }
  return { generatedAt: now.toISOString(), days: dates.length, timezone: ZONE, children: result };
}

async function videoTitles(): Promise<Map<string, string>> {
  const titles = new Map(VIDEOS.map(video => [video.id, video.title]));
  try { for (const video of (await fetchCatalogSnapshot()).videos) titles.set(video.id, video.title); } catch { /* Static titles are enough. */ }
  return titles;
}

async function posthogRows(query: string): Promise<unknown[][]> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key || !process.env.POSTHOG_PROJECT_ID) throw new StatsUnavailable("not_configured");
  const host = (process.env.POSTHOG_API_HOST || "https://us.posthog.com").replace(/\/+$/, "");
  const project = process.env.POSTHOG_PROJECT_ID || "0";
  try {
    const response = await fetch(`${host}/api/projects/${encodeURIComponent(project)}/query/`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!response.ok) throw new StatsUnavailable("upstream");
    const body = await response.json() as { results?: unknown[][] };
    if (!Array.isArray(body.results)) throw new StatsUnavailable("upstream");
    return body.results;
  } catch (error) {
    if (error instanceof StatsUnavailable) throw error;
    throw new StatsUnavailable("upstream");
  }
}

const cache = new Map<string, { at: number; key: string; stats: FamilyStats }>();

/** Statistics for these children, cached per family for ten minutes so a reopened panel costs no query. */
export async function readFamilyStats(familyId: string, children: string[], now = new Date()): Promise<FamilyStats> {
  const ids = children.filter(isProfileId);
  const { dates, start } = statsWindow(now);
  if (ids.length === 0) return { generatedAt: now.toISOString(), days: dates.length, timezone: ZONE, children: [] };
  const cacheKey = ids.join(",");
  const hit = cache.get(familyId);
  if (hit && hit.key === cacheKey && now.getTime() - hit.at < CACHE_MS) return hit.stats;
  const [rows, titles] = await Promise.all([posthogRows(statsQuery(ids, start)), videoTitles()]);
  const stats = shapeStats(rows, ids, dates, titles, now);
  cache.set(familyId, { at: now.getTime(), key: cacheKey, stats });
  return stats;
}

export const clearStatsCache = () => cache.clear();
