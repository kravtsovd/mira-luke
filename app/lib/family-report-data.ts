import "server-only";

import researchVideos from "@/app/data/research-videos.json";
import { DEFAULT_FAMILY } from "@/app/lib/auth";
import { readSharedEnglishProgress } from "@/app/lib/game-progress-store";
import { isProfileId } from "@/app/lib/profiles";


type Row = any[];
type Data = Record<string, any>;

export const REPORT_DAYS = 30;
const PROJECT_ID = Number(process.env.POSTHOG_PROJECT_ID || "0");
const HOST = "https://us.posthog.com";
const ZONE = process.env.APP_TIMEZONE || "UTC";
// The app marks every host other than localhost as is_test, so production is selected by host.
const PROD_HOSTS = (process.env.ANALYTICS_ALLOWED_HOSTS || "localhost,127.0.0.1").split(",").map(host => host.trim()).filter(host => /^[a-zA-Z0-9.:-]+$/.test(host));
const PROGRESS_URL = "/api/game-progress?profile=mira";
const CACHE_MS = 10 * 60 * 1000;

export class ReportDataUnavailable extends Error {}

// ---------- time: instants are integer microseconds since the epoch, exactly like Python datetimes ----------

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const localParts = (micros: number) => {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(Math.floor(micros / 1000))).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
};
/** Local calendar date (YYYY-MM-DD) of an instant. */
export const localDate = (micros: number) => localParts(micros).date;
/** UTC instant of local midnight on a calendar date (the offset in force at that midnight). */
export function localMidnight(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const micros = (Date.UTC(y, m - 1, d) + offsetMinutes * 60_000) * 1000;
    const local = localParts(micros);
    if (local.date === date && local.hour === 0 && local.minute === 0) return micros;
  }
  throw new Error(`No local midnight for ${date}`);
}
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Parse a ClickHouse/ISO timestamp; strings without an offset are UTC. */
export function parseInstant(value: unknown): number {
  const text = String(value).trim().replace(" ", "T");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!match) throw new Error(`Bad timestamp ${text}`);
  const [, y, mo, d, h, mi, s, frac = "", zone = "Z"] = match;
  let micros = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) * 1000 + Number(frac.padEnd(6, "0"));
  if (zone !== "Z") {
    const sign = zone[0] === "-" ? -1 : 1;
    micros -= sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) * 60_000_000;
  }
  return micros;
}
/** Python's datetime.isoformat() for a UTC instant: "auto" drops a zero fraction, "milliseconds"/"seconds" truncate. */
export function isoUtc(micros: number, timespec: "auto" | "milliseconds" | "seconds" = "auto"): string {
  const seconds = Math.floor(micros / 1_000_000);
  const fraction = micros - seconds * 1_000_000;
  const base = new Date(seconds * 1000).toISOString().slice(0, 19);
  const tail = timespec === "seconds" ? "" : timespec === "milliseconds" ? `.${String(Math.floor(fraction / 1000)).padStart(3, "0")}`
    : fraction ? `.${String(fraction).padStart(6, "0")}` : "";
  return `${base}${tail}+00:00`;
}
const epochSeconds = (micros: number) => Math.trunc(micros / 1_000_000);
const sqlTime = (micros: number) => isoUtc(micros, "seconds").slice(0, 19).replace("T", " ");

// ---------- Python number semantics ----------

/** Python's round(x, digits): exact binary value, ties to even. */
export function pyRound(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const exact = Math.abs(value).toFixed(60);
  const [whole, fraction] = exact.split(".");
  const kept = whole + fraction.slice(0, digits);
  const rest = fraction.slice(digits);
  let up = rest[0] > "5" || (rest[0] === "5" && (/[1-9]/.test(rest.slice(1)) || Number(kept.at(-1)) % 2 === 1));
  if (rest[0] < "5") up = false;
  let scaled = BigInt(kept) + (up ? BigInt(1) : BigInt(0));
  const negative = value < 0 && scaled !== BigInt(0);
  if (negative) scaled = -scaled;
  return Number(scaled) / 10 ** digits;
}
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (position - low);
}
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** str(x) as Python prints it, for keys and sort order. */
const pyStr = (value: unknown) => value === null || value === undefined ? "None" : value === true ? "True" : value === false ? "False" : String(value);
const lower = (value: unknown) => pyStr(value).toLowerCase();
const isTrue = (value: unknown) => ["true", "1"].includes(lower(value));
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const compareTuples = (a: string[], b: string[]) => {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const order = compare(a[index], b[index]);
    if (order) return order;
  }
  return a.length - b.length;
};
const keyOf = (...parts: unknown[]) => JSON.stringify(parts.map(part => (part === undefined ? null : part)));

// ---------- query ----------

const COLUMNS: Record<string, string> = {
  events_total: "event,n", hosts_seen: "h,t,n",
  daily_profile: "d,p,answers,correct,completed,videos,minutes,sessions",
  games: "g,p,started,completed,abandoned,idle,answers,correct,avg_sec,med_sec,avg_attempts,p90_sec,timed_completions",
  completion_speed: "p,g,sec,attempts,timestamp",
  daily_games: "d,p,g,started,completed,avg_sec,med_sec,answers,correct",
  round_events: "ts,event,p,g,sec,att,os,b,sid,c,t,variant,level,name_id,step_sec,step_errors,next_level,mastered,clean,mistakes,stars_before,stars_after,test_mode,streak_after,level_up_reason,level_clean_rounds,level_miss_rounds",
  game_builds: "d,p,g,b,started,completed,first_ts,last_ts",
  silent_sessions: "sid,d,p,last_event,first_ts,last_ts,os,n",
  watch_samples: "ts,p,sid,seconds",
  daily_videos: "d,p,v,started,minutes",
  answer_method: "p,m,c,n",
  videos: "v,p,selected,started,completed,minutes", errors: "event,p,b,os,n",
  error_samples: "ts,event,p,v,msg,online,sid", ux: "event,p,dt,n,sessions",
  dead_click_targets: "t,s,p,n", no_results_search: "p,no_results,total",
  devices: "dt,b,os,sessions",
};

export interface ReportWindow { start: number; end: number; startSql: string; endSql: string }

/** The last REPORT_DAYS local calendar days: from local midnight REPORT_DAYS-1 days ago to now (whole seconds). */
export function reportWindow(now = new Date(), days = REPORT_DAYS): ReportWindow {
  const end = Math.floor(now.getTime() / 1000) * 1_000_000;
  const start = localMidnight(addDays(localDate(end), -(days - 1)));
  return { start, end, startSql: sqlTime(start), endSql: sqlTime(end) };
}

/** One HogQL statement returning (section, JSON payload) rows, identical to fetch_posthog.py --export-query. */
export function reportQuery(profiles: string[], window: ReportWindow): string {
  const ids = profiles.filter(isProfileId);
  if (!ids.length) throw new Error("No children");
  const hosts = PROD_HOSTS.map(host => `'${host}'`).join(",");
  const timeFilter = `timestamp >= toDateTime('${window.startSql}', 'UTC') AND timestamp < toDateTime('${window.endSql}', 'UTC')`;
  const base = `${timeFilter} AND properties.$host IN (${hosts}) AND (properties.profile IN (${ids.map(id => `'${id}'`).join(",")}) OR properties.profile IS NULL)`;
  const queries: Record<string, string> = {
    events_total: `SELECT event, count() n FROM events WHERE ${base} GROUP BY event ORDER BY count() DESC`,
    hosts_seen: `SELECT properties.$host h, properties.is_test t, count() n FROM events WHERE ${timeFilter} GROUP BY 1,2 ORDER BY 3 DESC`,
    daily_profile: `SELECT toDate(toTimeZone(timestamp, 'America/Los_Angeles')) d, properties.profile p,
               countIf(event='game_answered') answers, countIf(event='game_answered' AND properties.correct = true) correct,
               countIf(event='game_completed') completed, countIf(event='video_started') videos,
               sumIf(toFloat(properties.watched_seconds), event='video_watch_time')/60 minutes,
               uniqExactIf($session_id, $session_id IS NOT NULL AND $session_id != '') sessions
        FROM events WHERE ${base} GROUP BY d, p ORDER BY d, p`,
    games: `SELECT properties.game g, properties.profile p,
               countIf(event='game_started') started, countIf(event='game_completed') completed,
               countIf(event='game_abandoned') abandoned, countIf(event='game_idle') idle,
               countIf(event='game_answered') answers, countIf(event='game_answered' AND properties.correct = true) correct,
               round(avgIf(toFloat(properties.duration_seconds), event='game_completed'), 1) avg_sec,
               round(medianIf(toFloat(properties.duration_seconds), event='game_completed'), 1) med_sec,
               round(avgIf(toFloat(properties.attempts), event='game_completed'), 2) avg_attempts,
               round(quantileIf(0.9)(toFloat(properties.duration_seconds), event='game_completed' AND properties.duration_seconds IS NOT NULL),1) p90_sec,
               countIf(event='game_completed' AND properties.duration_seconds IS NOT NULL) timed_completions
        FROM events WHERE ${base} AND event IN ('game_started','game_completed','game_abandoned','game_idle','game_answered')
        GROUP BY g, p ORDER BY g, p`,
    completion_speed: `SELECT properties.profile p, properties.game g, toFloat(properties.duration_seconds) sec, toInt(properties.attempts) attempts, timestamp
        FROM events WHERE ${base} AND event='game_completed' ORDER BY timestamp DESC LIMIT 2000`,
    daily_games: `SELECT toDate(toTimeZone(timestamp, 'America/Los_Angeles')) d, properties.profile p, properties.game g,
               countIf(event='game_started') started, countIf(event='game_completed') completed,
               round(avgIf(toFloat(properties.duration_seconds), event='game_completed'), 1) avg_sec,
               round(medianIf(toFloat(properties.duration_seconds), event='game_completed'), 1) med_sec,
               countIf(event='game_answered') answers, countIf(event='game_answered' AND properties.correct = true) correct
        FROM events WHERE ${base} AND event IN ('game_started','game_completed','game_answered')
        GROUP BY d, p, g ORDER BY d, p, g`,
    // uuid (UUIDv7) keeps emission order when a round's last answer and its completion share a millisecond.
    round_events: `SELECT timestamp ts, event, properties.profile p, properties.game g, toFloat(properties.duration_seconds) sec,
               toFloat(properties.attempts) att, properties.$os os, properties.build b, $session_id sid,
               toString(properties.correct) c, toString(properties.trigger) t,
               toString(properties.game_variant) variant, toString(properties.level_id) level,
               toString(properties.name_id) name_id, toFloat(properties.step_seconds) step_sec,
               toInt(properties.errors) step_errors, toInt(properties.next_level) next_level,
               toString(properties.mastered) mastered, toString(properties.clean) clean,
               toInt(properties.mistakes) mistakes, toInt(properties.stars_before) stars_before,
               toInt(properties.stars_after) stars_after, toString(properties.test_mode) test_mode,
               toInt(properties.streak_after) streak_after, toString(properties.level_up_reason) level_up_reason,
               toInt(properties.level_clean_rounds) level_clean_rounds,
               toInt(properties.level_miss_rounds) level_miss_rounds
        FROM events WHERE ${base} AND event IN ('game_opened','game_started','game_idle','game_answered','game_step_completed','game_round_scored','game_level_up','game_completed','game_abandoned')
        ORDER BY timestamp, uuid LIMIT 50000`,
    game_builds: `SELECT toDate(toTimeZone(timestamp, 'America/Los_Angeles')) d, properties.profile p, properties.game g, properties.build b,
               countIf(event='game_started') started, countIf(event='game_completed') completed,
               min(timestamp) first_ts, max(timestamp) last_ts
        FROM events WHERE ${base} AND event IN ('game_started','game_completed')
        GROUP BY d, p, g, b ORDER BY d, p, g, b`,
    silent_sessions: `SELECT $session_id sid, toDate(toTimeZone(min(timestamp), 'America/Los_Angeles')) d,
               argMaxIf(properties.profile, timestamp, properties.profile IS NOT NULL) p,
               argMax(event, timestamp) last_event, min(timestamp) first_ts, max(timestamp) last_ts,
               any(properties.$os) os, count() n
        FROM events WHERE ${base} AND $session_id IS NOT NULL AND $session_id != ''
        GROUP BY sid HAVING countIf(event='video_started') = 0 AND countIf(event='game_started') = 0
        ORDER BY first_ts`,
    watch_samples: `SELECT timestamp ts, properties.profile p, $session_id sid,
               toFloat(properties.watched_seconds) seconds
        FROM events WHERE ${base} AND event='video_watch_time'
        AND toFloat(properties.watched_seconds) > 0
        ORDER BY timestamp LIMIT 100000`,
    daily_videos: `SELECT toDate(toTimeZone(timestamp, 'America/Los_Angeles')) d, properties.profile p, properties.video_id v,
               countIf(event='video_started') started,
               sumIf(toFloat(properties.watched_seconds), event='video_watch_time')/60 minutes
        FROM events WHERE ${base} AND event IN ('video_started','video_watch_time') AND v IS NOT NULL
        GROUP BY d, p, v ORDER BY d, p, minutes DESC LIMIT 1000`,
    answer_method: `SELECT properties.profile p, properties.method m, properties.correct c, count() n
        FROM events WHERE ${base} AND event='game_answered' GROUP BY 1,2,3 ORDER BY 4 DESC`,
    videos: `SELECT properties.video_id v, properties.profile p,
               countIf(event='video_selected') selected, countIf(event='video_started') started, countIf(event='video_completed') completed,
               sumIf(toFloat(properties.watched_seconds), event='video_watch_time')/60 minutes
        FROM events WHERE ${base} AND event IN ('video_selected','video_started','video_completed','video_watch_time') AND v IS NOT NULL
        GROUP BY v, p ORDER BY minutes DESC, started DESC LIMIT 200`,
    errors: `SELECT event, properties.profile p, properties.$browser b, properties.$os os, count() n
        FROM events WHERE ${base} AND event IN ('video_error','video_stalled','video_stall_recovered','video_start_timeout','player_ready_timeout',
             'player_initialization_failed','video_autoplay_blocked','video_readiness_timeout','catalog_fetch_failed','catalog_fallback',
             'search_failed','recommendations_failed','settings_storage_failed','$exception','connection_changed')
        GROUP BY 1,2,3,4 ORDER BY 5 DESC`,
    error_samples: `SELECT timestamp ts, event, properties.profile p, properties.video_id v, properties.$exception_message msg, properties.online online, $session_id sid
        FROM events WHERE ${base} AND event IN ('video_error','video_start_timeout','player_ready_timeout','player_initialization_failed','$exception','connection_changed')
        ORDER BY timestamp DESC LIMIT 60`,
    ux: `SELECT event, properties.profile p, properties.$device_type dt, count() n, uniqExactIf($session_id, $session_id IS NOT NULL AND $session_id != '') sessions
        FROM events WHERE ${base} AND event IN ('$rageclick','$dead_click','$dead_swipe','game_idle','game_abandoned','ui_long_task','video_retry_clicked','profile_switched','search_completed','search_failed')
        GROUP BY 1,2,3 ORDER BY 4 DESC`,
    dead_click_targets: `SELECT properties.$el_text t, properties.$el_selector s, properties.profile p, count() n
        FROM events WHERE ${base} AND event IN ('$dead_click','$rageclick') GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 25`,
    no_results_search: `SELECT properties.profile p, countIf(properties.no_results = true) no_results, count() total
        FROM events WHERE ${base} AND event='search_completed' GROUP BY p`,
    devices: `SELECT properties.$device_type dt, properties.$browser b, properties.$os os, uniqExactIf($session_id, $session_id IS NOT NULL AND $session_id != '') sessions FROM events WHERE ${base} GROUP BY 1,2,3 ORDER BY 4 DESC`,
  };
  return Object.entries(queries)
    .map(([name, query]) => `SELECT '${name}' AS section, toJSONString(groupArray(tuple(${COLUMNS[name]}))) AS payload FROM (${query})`)
    .join("\nUNION ALL\n");
}

/** The metadata block fetch_posthog.py writes before any data (its manifest). */
export function reportHeader(window: ReportWindow, days = REPORT_DAYS): Data {
  return {
    generated_at: isoUtc(window.end, "seconds"), days, project_id: PROJECT_ID, hosts: [...PROD_HOSTS],
    source: `${HOST}/project/${PROJECT_ID}`, timezone: ZONE,
    window_start: `${window.startSql.replace(" ", "T")}Z`, window_end: `${window.endSql.replace(" ", "T")}Z`,
    quality_notes: [
      "Данные включают проверки сайта; is_test пока не отделяет их надёжно.",
      "Мира и Люк - выбранные профили, не подтверждённая идентификация ребёнка.",
      "Время раунда включает паузы и фон; сравнивать только внутри одной игры.",
      "Сессии по дням и профилям нельзя складывать как уникальных людей.",
      "Бездействие и клики без эффекта - сигналы для проверки, не доказательство ошибки UI.",
    ],
  };
}

// ---------- shaping (fetch_posthog.py after the query) ----------

/** Viewing periods: a session's samples on one local date, split where the gap exceeds ten minutes. */
export function watchPeriods(samples: Row[]): Row[] {
  const groups = new Map<string, { day: string; profile: unknown; rows: [number, number, number][] }>();
  for (const [timestamp, profile, sessionId, rawSeconds] of samples) {
    const seconds = Number(rawSeconds || 0);
    if (seconds <= 0) continue;
    const end = parseInstant(timestamp);
    const day = localDate(end);
    const start = Math.max(end - Math.round(seconds * 1e6), localMidnight(day));
    const key = keyOf(day, profile, sessionId);
    if (!groups.has(key)) groups.set(key, { day, profile, rows: [] });
    groups.get(key)!.rows.push([start, end, seconds]);
  }
  const periods: Row[] = [];
  for (const { day, profile, rows } of groups.values()) {
    let current: [number, number, number] | null = null;
    for (const [start, end, seconds] of [...rows].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])) {
      if (current === null || (start - current[1]) / 1e6 > 600) {
        if (current !== null) periods.push([day, profile, isoUtc(current[0]), isoUtc(current[1]), current[2] / 60]);
        current = [start, end, seconds];
      } else {
        current[1] = Math.max(current[1], end);
        current[2] += seconds;
      }
    }
    if (current !== null) periods.push([day, profile, isoUtc(current[0]), isoUtc(current[1]), current[2] / 60]);
  }
  return periods.sort((a, b) => compareTuples([a[0], pyStr(a[1]), a[2]], [b[0], pyStr(b[1]), b[2]]));
}

type Titles = Record<string, { title: string | null; channel: string | null; topic: string | null }>;

/** Turn the query's (section, payload) rows into the dashboards' data object. */
export function shapeReport(header: Data, sections: Row[], extras: { retrievedAt: Date; titles: Titles; englishProgress: Data }): Data {
  const out: Data = { ...header };
  const names = Object.keys(COLUMNS);
  if (sections.length !== names.length || new Set(sections.map(row => row[0])).size !== names.length || !sections.every(row => names.includes(row[0]))) {
    throw new Error("Missing or duplicate SQL result sections; refusing partial dashboard");
  }
  for (const [name, payload] of sections) {
    out[name] = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (out[name].some((row: Row) => row.length !== COLUMNS[name].split(",").length)) throw new Error(`Unexpected column count in ${name}`);
  }
  out.retrieved_at = isoUtc(Math.floor(extras.retrievedAt.getTime() / 1000) * 1_000_000, "seconds");
  out.retrieval_method = "PostHog query API";
  const totals: Record<string, number> = Object.fromEntries(out.events_total);
  // SQL datetime strings are UTC; browsers otherwise assume local time.
  for (const [name, column] of [["completion_speed", 4], ["error_samples", 0], ["silent_sessions", 4], ["silent_sessions", 5]] as const) {
    for (const row of out[name]) row[column] = isoUtc(parseInstant(row[column]), "milliseconds");
  }
  const sum = (rows: Row[], index: number) => rows.reduce((total, row) => total + row[index], 0);
  if (sum(out.daily_profile, 2) !== (totals.game_answered ?? 0)) throw new Error("Daily answers do not reconcile to event totals");
  if (sum(out.games, 3) !== (totals.game_completed ?? 0)) throw new Error("Game completions do not reconcile to event totals");
  if (sum(out.daily_games, 4) !== (totals.game_completed ?? 0)) throw new Error("Daily game completions do not reconcile to event totals");
  out.truncation = {
    completion_speed: (totals.game_completed ?? 0) > out.completion_speed.length, daily_videos: out.daily_videos.length >= 1000,
    videos: out.videos.length >= 200, error_samples: out.error_samples.length >= 60,
  };
  out.completion_speed.sort((a: Row, b: Row) => compare(a[4], b[4]));
  const samples: Row[] = out.watch_samples;
  delete out.watch_samples;
  if (samples.length >= 100000) throw new Error("Viewing timestamps reached the export limit");
  out.watch_periods = watchPeriods(samples);
  out.watch_periods_gap_minutes = 10;
  const watchTotals = new Map<string, number>();
  for (const [day, profile, , , minutes] of out.watch_periods) watchTotals.set(keyOf(day, profile), (watchTotals.get(keyOf(day, profile)) ?? 0) + minutes);
  for (const row of out.daily_profile) {
    if (Math.abs((watchTotals.get(keyOf(row[0], row[1])) ?? 0) - (row[6] || 0)) > 0.01) throw new Error("Viewing periods do not reconcile to daily minutes");
  }

  // One row per finished/abandoned round. A round is "focused" when no game_idle (45 s without an answer) fired
  // between its start and its end in the same session and game.
  const fresh = () => ({ idle: false, answers: 0, wrong: 0, trigger: null as unknown, variant: null as unknown, level: null as unknown,
    steps: [] as Row[], levelUps: [] as Row[], roundScores: [] as Row[], testModeFlags: [] as string[] });
  type RoundState = ReturnType<typeof fresh>;
  const openRounds = new Map<string, RoundState>();
  const ensure = (key: string) => { if (!openRounds.has(key)) openRounds.set(key, fresh()); return openRounds.get(key)!; };
  const rounds: Row[] = [];
  const excluded = { night: 0, flip: 0, manual: 0, english_test_mode: 0 };
  const lastOpen = new Map<string, unknown>();
  const droppedCompletions = new Set<string>();
  const nameSteps: Row[] = [], englishLevelUps: Row[] = [], englishRoundScores: Row[] = [];
  for (const [ts, event, p, g, sec, att, os, build, sid, correct, trigger, variant, level, nameId, stepSec, stepErrors, nextLevel, mastered, clean,
    mistakes, starsBefore, starsAfter, testMode, streakAfter, levelUpReason, levelCleanRounds, levelMissRounds] of out.round_events as Row[]) {
    const roundKey = keyOf(sid, p, g);
    const stamp = parseInstant(ts);
    if (g === "english-find" && event !== "game_opened" && event !== "game_started") ensure(roundKey).testModeFlags.push(lower(testMode));
    if (event === "game_opened") {
      // game_opened names the launcher's game ("huntrix") while the round may be "huntrix-syllables".
      lastOpen.set(keyOf(sid, p), trigger);
    } else if (event === "game_started") {
      const state = fresh();
      openRounds.set(roundKey, state);
      const openKey = keyOf(sid, p);
      state.trigger = lastOpen.has(openKey) ? lastOpen.get(openKey) : null;
      lastOpen.delete(openKey);
      state.variant = variant;
      if (g === "english-find") state.testModeFlags.push(lower(testMode));
      // The deployed e8a21f1 build has exactly seven NAME_CARDS but did not emit level_id.
      state.level = level || (variant === "build-name-v1" ? "familiar-three"
        : variant === "build-name-v2" && String(build || "").startsWith("e8a21f1") ? "easy-seven" : null);
    } else if (event === "game_idle") {
      ensure(roundKey).idle = true;
    } else if (event === "game_answered") {
      const state = ensure(roundKey);
      state.answers += 1;
      state.wrong += isTrue(correct) ? 0 : 1;
    } else if (event === "game_step_completed") {
      if (nameId) ensure(roundKey).steps.push([nameId, stepSec, stepErrors, stamp]);
    } else if (event === "game_level_up") {
      if (g === "english-find" && level) ensure(roundKey).levelUps.push([level, nextLevel, isTrue(mastered), stamp]);
    } else if (event === "game_round_scored") {
      if (g === "english-find" && level) {
        ensure(roundKey).roundScores.push([level, isTrue(clean), mistakes, starsBefore, starsAfter, streakAfter, levelUpReason, levelCleanRounds, levelMissRounds, stamp]);
      }
    } else {
      const state = openRounds.get(roundKey) ?? fresh();
      openRounds.delete(roundKey);
      const local = localParts(stamp);
      // Kids are asleep 00:00-06:00, so rounds then are adults checking a release; a round closed within
      // 5 s without a single answer is a flip, not play. Both stay out of every skill number.
      if (local.hour < 6) { excluded.night += 1; continue; }
      if (event === "game_abandoned" && !(att || 0) && (sec || 0) < 5) { excluded.flip += 1; continue; }
      // the maintainer, 2026-09-30: only games the watch timer opened during a cartoon count as the child's play.
      if (state.trigger !== "watch_timer") {
        excluded.manual += 1;
        if (event === "game_completed") droppedCompletions.add(keyOf(p, g, epochSeconds(stamp)));
        continue;
      }
      // PR #44: English practice runs never change Mira's saved stars; require an explicit false on every event.
      if (g === "english-find" && (!state.testModeFlags.length || state.testModeFlags.some(flag => flag !== "false"))) {
        excluded.english_test_mode += 1;
        if (event === "game_completed") droppedCompletions.add(keyOf(p, g, epochSeconds(stamp)));
        continue;
      }
      rounds.push([local.date, p, g, sec, att, event === "game_completed" ? "completed" : "abandoned", !state.idle, os, build,
        isoUtc(stamp, "seconds"), state.answers, state.wrong, state.variant, state.level]);
      for (const [itemId, itemSec, itemErrors, itemStamp] of state.steps) nameSteps.push([localDate(itemStamp), p, state.level, itemId, itemSec, itemErrors, !state.idle]);
      for (const [levelId, following, isMastered, levelStamp] of state.levelUps) englishLevelUps.push([localDate(levelStamp), p, levelId, following, isMastered, state.variant]);
      for (const [levelId, isClean, errorCount, before, after, streak, reason, levelClean, levelMiss, scoreStamp] of state.roundScores) {
        englishRoundScores.push([localDate(scoreStamp), p, levelId, isClean, errorCount, before, after, state.variant, streak, reason, levelClean, levelMiss]);
      }
    }
  }
  delete out.round_events;
  out.rounds = rounds;
  out.rounds_excluded = excluded;
  out.name_steps = nameSteps;
  out.english_level_ups = englishLevelUps;
  out.english_round_scores = englishRoundScores;
  // Replace only English's raw aggregate with the accepted rounds, so adult practice never counts as Mira's play.
  out.raw_english_games = out.games.filter((row: Row) => row[0] === "english-find");
  const englishByProfile = new Map<string, { profile: unknown; rows: Row[]; completed: Row[] }>();
  for (const row of rounds) {
    if (row[2] !== "english-find") continue;
    const key = keyOf(row[1]);
    if (!englishByProfile.has(key)) englishByProfile.set(key, { profile: row[1], rows: [], completed: [] });
    const group = englishByProfile.get(key)!;
    group.rows.push(row);
    if (row[5] === "completed") group.completed.push(row);
  }
  out.games = out.games.filter((row: Row) => row[0] !== "english-find");
  for (const { profile, rows: rs, completed: done } of [...englishByProfile.values()].sort((a, b) => compare(pyStr(a.profile), pyStr(b.profile)))) {
    const secs = done.filter(row => row[3] !== null).map(row => Number(row[3]));
    const attempts = done.filter(row => row[4] !== null).map(row => Number(row[4]));
    const answers = rs.reduce((total, row) => total + row[10], 0);
    const wrong = rs.reduce((total, row) => total + row[11], 0);
    out.games.push(["english-find", profile, rs.length, done.length, rs.length - done.length, rs.filter(row => !row[6]).length, answers, answers - wrong,
      secs.length ? pyRound(mean(secs), 1) : null, secs.length ? median(secs) : null,
      attempts.length ? pyRound(mean(attempts), 2) : null, secs.length ? pyRound(percentile(secs, 0.9)!, 1) : null, secs.length]);
  }
  const byLevel = new Map<string, { key: [unknown, string]; started: number; done: number; times: number[]; errors: number[] }>();
  for (const row of rounds) {
    if (row[1] !== "mira" || row[2] !== "huntrix-syllables") continue;
    const key: [unknown, string] = [row[1], row[13] || "unknown"];
    if (!byLevel.has(keyOf(...key))) byLevel.set(keyOf(...key), { key, started: 0, done: 0, times: [], errors: [] });
    const agg = byLevel.get(keyOf(...key))!;
    agg.started += 1;
    if (row[5] === "completed") {
      agg.done += 1;
      if (row[6] && row[3] !== null) { agg.times.push(Number(row[3])); agg.errors.push(Math.trunc(Number(row[11]))); }
    }
  }
  out.name_levels = [...byLevel.values()].sort((a, b) => compareTuples(a.key.map(pyStr), b.key.map(pyStr))).map(a => [a.key[0], a.key[1], a.started, a.done, a.times.length,
    a.times.length ? median(a.times) : null, a.errors.length ? median(a.errors) : null, a.errors.filter(value => value === 0).length]);
  // Every per-day game number is rebuilt from the kept rounds, so tests leave no trace in any section.
  const perGame = new Map<string, { key: Row; started: number; done: number[]; answers: number; correct: number }>();
  for (const [d, p, g, sec, , status, , , , , answers, wrong] of rounds) {
    const key = keyOf(d, p, g);
    if (!perGame.has(key)) perGame.set(key, { key: [d, p, g], started: 0, done: [], answers: 0, correct: 0 });
    const agg = perGame.get(key)!;
    agg.started += 1;
    agg.answers += answers;
    agg.correct += answers - wrong;
    if (status === "completed" && sec !== null) agg.done.push(Number(sec));
  }
  out.daily_games = [...perGame.values()].sort((a, b) => compareTuples(a.key.map(pyStr), b.key.map(pyStr))).map(a => [...a.key, a.started, a.done.length,
    a.done.length ? pyRound(mean(a.done), 1) : null, a.done.length ? median(a.done) : null, a.answers, a.correct]);
  const perDay = new Map<string, [number, number, number]>();
  for (const row of out.daily_games) {
    const key = keyOf(row[0], row[1]);
    const acc = perDay.get(key) ?? [0, 0, 0];
    acc[0] += row.at(-2); acc[1] += row.at(-1); acc[2] += row[4];
    perDay.set(key, acc);
  }
  for (const row of out.daily_profile) [row[2], row[3], row[4]] = perDay.get(keyOf(row[0], row[1])) ?? [0, 0, 0];
  const completionKey = (row: Row): [unknown, unknown, number] => [row[0], row[1], epochSeconds(parseInstant(row[4]))];
  out.completion_speed = out.completion_speed.filter((row: Row) => {
    const [p, g, at] = completionKey(row);
    return ![-1, 0, 1].some(delta => droppedCompletions.has(keyOf(p, g, at + delta)));
  });
  const englishDone = new Set(rounds.filter(row => row[2] === "english-find" && row[5] === "completed").map(row => keyOf(row[1], epochSeconds(parseInstant(row[9])))));
  out.completion_speed = out.completion_speed.filter((row: Row) => row[1] !== "english-find"
    || [-1, 0, 1].some(delta => englishDone.has(keyOf(row[0], completionKey(row)[2] + delta))));

  const videoIds = new Set<string>([...out.videos.map((row: Row) => row[0]), ...out.daily_videos.map((row: Row) => row[2])].filter(Boolean));
  out.titles = Object.fromEntries([...videoIds].map(id => [id, extras.titles[id] ?? { title: null, channel: null, topic: null }]));
  out.english_server_progress = extras.englishProgress;
  return out;
}

// ---------- sources ----------

const titleCache: Titles = {};
for (const video of researchVideos as { id: string; title?: string; channel?: string; topicId?: string }[]) {
  titleCache[video.id] = { title: video.title ?? null, channel: video.channel ?? null, topic: video.topicId ?? null };
}

/** Catalog titles, then titles already known (from the stored page), then YouTube oEmbed for the rest. */
async function videoTitles(ids: string[], known: Titles): Promise<Titles> {
  for (const [id, meta] of Object.entries(known)) if (meta?.title && !titleCache[id]) titleCache[id] = meta;
  const missing = ids.filter(id => !titleCache[id]?.title && /^[A-Za-z0-9_-]{11}$/.test(id));
  for (let index = 0; index < missing.length; index += 6) {
    await Promise.all(missing.slice(index, index + 6).map(async id => {
      try {
        const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) return;
        const body = await response.json() as { title?: string; author_name?: string };
        titleCache[id] = { title: body.title ?? null, channel: body.author_name ?? null, topic: null };
      } catch { /* the page shows the id */ }
    }));
  }
  return titleCache;
}

/** Mira's cross-device English progress; only the default family has it. */
async function englishProgress(familyId: string): Promise<Data> {
  const fetchedAt = isoUtc(Date.now() * 1000, "seconds");
  if (familyId !== DEFAULT_FAMILY) return { status: "unavailable", source: PROGRESS_URL, fetched_at: fetchedAt, reason: "NoEnglishProfile" };
  try {
    const progress = await readSharedEnglishProgress("mira") as unknown as Data;
    const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
    const valid = progress && [1, 2, 3, 4].includes(progress.level) && typeof progress.mastered === "boolean"
      && ["stars", "streak", "rounds", "cleanRounds"].every(field => count(progress[field]))
      && progress.levels && [1, 2, 3, 4].every(level => progress.levels[String(level)] && count(progress.levels[String(level)].clean) && count(progress.levels[String(level)].miss));
    if (!valid) throw new Error("ValueError");
    return { status: "ok", source: PROGRESS_URL, fetched_at: fetchedAt, progress };
  } catch (error) {
    return { status: "unavailable", source: PROGRESS_URL, fetched_at: fetchedAt, reason: error instanceof Error && error.message === "ValueError" ? "ValueError" : "OSError" };
  }
}

// Synchronous PostHog API queries stop after 10 s, and this one takes 7-30 s when PostHog is busy (504 "max execution
// time", 2026-10-12). An async query has no such limit: start it, then poll its status until it completes.
async function posthogSections(query: string, deadline = Date.now() + 100_000): Promise<Row[]> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key || !process.env.POSTHOG_PROJECT_ID) throw new ReportDataUnavailable("not_configured");
  const host = (process.env.POSTHOG_API_HOST || HOST).replace(/\/+$/, "");
  const base = `${host}/api/projects/${encodeURIComponent(process.env.POSTHOG_PROJECT_ID || String(PROJECT_ID))}/query/`;
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    if (!response.ok) throw new ReportDataUnavailable(`PostHog HTTP ${response.status}`);
    return await response.json() as { results?: Row[]; hasMore?: boolean; error?: string; query_status?: PostHogStatus };
  };
  let body = await call(base, { method: "POST", body: JSON.stringify({ query: { kind: "HogQLQuery", query }, refresh: "force_async" }) });
  while (!body.results) {
    const status = body.query_status;
    if (!status?.id || status.error) throw new ReportDataUnavailable(status?.error_message || "PostHog query failed");
    if (status.complete && status.results) { body = status.results; break; }
    if (Date.now() + 1000 > deadline) throw new ReportDataUnavailable("PostHog query took too long");
    await new Promise(resolve => setTimeout(resolve, 1000));
    body = await call(`${base}${encodeURIComponent(status.id)}/`);
  }
  if (body.error || body.hasMore || !Array.isArray(body.results)) throw new ReportDataUnavailable("PostHog query is incomplete");
  return body.results;
}
interface PostHogStatus { id?: string; complete?: boolean; error?: boolean; error_message?: string | null; results?: { results?: Row[]; hasMore?: boolean; error?: string } }

const cache = new Map<string, { at: number; key: string; data: Data }>();
export const clearReportCache = () => cache.clear();

/** Data younger than ten minutes, if this server already has it: the page then opens without waiting. */
export function cachedReportData(familyId: string, now = new Date()): Data | null {
  const hit = cache.get(familyId);
  return hit && now.getTime() - hit.at < CACHE_MS ? hit.data : null;
}

/** Fresh dashboard data for a family's children, cached per family for ten minutes. */
export async function readFamilyReportData(familyId: string, children: string[], known: Titles = {}, now = new Date()): Promise<Data> {
  const ids = children.filter(isProfileId);
  if (!ids.length) throw new ReportDataUnavailable("no_children");
  const cacheKey = ids.join(",");
  const hit = cache.get(familyId);
  if (hit && hit.key === cacheKey && now.getTime() - hit.at < CACHE_MS) return hit.data;
  const window = reportWindow(now);
  const [sections, progress] = await Promise.all([posthogSections(reportQuery(ids, window)), englishProgress(familyId)]);
  const videoIds = new Set<string>();
  for (const [name, payload] of sections) {
    if (name !== "videos" && name !== "daily_videos") continue;
    for (const row of JSON.parse(String(payload)) as Row[]) { const id = name === "videos" ? row[0] : row[2]; if (id) videoIds.add(id); }
  }
  const titles = await videoTitles([...videoIds], known);
  const data = shapeReport(reportHeader(window), sections, { retrievedAt: new Date(), titles, englishProgress: progress });
  cache.set(familyId, { at: now.getTime(), key: cacheKey, data });
  return data;
}

// ---------- the stored page ----------

const DATA_BLOCK = /(<script id="data" type="application\/json">)([\s\S]*?)(<\/script>)/;

/** The data embedded in a stored page, or null. */
export function embeddedData(html: string): Data | null {
  const match = DATA_BLOCK.exec(html);
  if (!match) return null;
  try { return JSON.parse(match[2]); } catch { return null; }
}

/** The stored page with its embedded data replaced; "<" is escaped so the JSON can never close the script. */
export function withData(html: string, data: Data): string | null {
  if (!DATA_BLOCK.test(html)) return null;
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  return html.replace(DATA_BLOCK, (_match, open: string, _old: string, close: string) => open + payload + close);
}

const shownTime = new Intl.DateTimeFormat("ru-RU", { timeZone: ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const NOTICE = "position:fixed;left:12px;bottom:12px;z-index:2147483647;max-width:calc(100% - 24px);padding:8px 12px;border-radius:10px;"
  + "font:14px/1.35 system-ui,sans-serif;color:#2b2b2b;background:#fff7d6;border:1px solid #e8d48a;box-shadow:0 2px 8px rgba(0,0,0,.12)";

/**
 * The page as served: "pending" shows the stored numbers and at once reloads itself with fresh ones (the browser keeps
 * this page on screen until they arrive); "live" and "snapshot" say what the numbers are and tidy the address.
 */
export function withNotice(html: string, source: "pending" | "live" | "snapshot"): string {
  const generated = embeddedData(html)?.generated_at;
  const when = generated && !Number.isNaN(Date.parse(generated)) ? shownTime.format(new Date(generated)) : "неизвестно когда";
  const text = source === "pending" ? `Показаны данные на ${when}. Загружаю свежие из PostHog…`
    : source === "live" ? `Свежие данные PostHog на ${when}.` : `Не удалось получить свежие данные из PostHog. Показаны данные на ${when}.`;
  const script = source === "pending"
    ? `location.replace(location.pathname + "?data=live");`
    : `if (location.search) history.replaceState(null, "", location.pathname);${source === "live" ? ` setTimeout(function () { var n = document.getElementById("report-freshness"); if (n) n.remove(); }, 5000);` : ""}`;
  const notice = `<div id="report-freshness" data-source="${source}" role="status" style="${NOTICE}">${text}</div><script>${script}</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, close => notice + close) : html + notice;
}
