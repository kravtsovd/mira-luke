import { familyRequest } from "./helpers/family-request";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTags, normalizeVideoId, parseLibraryInput } from "../app/lib/library-input";
import { addLibraryVideo, parseClassification, parseVideoMetadata } from "../app/lib/library-service";
import { authorizeLibrary, createLibraryTicket, LibraryBurstGuard } from "../app/lib/library-auth";
import { POST } from "../app/api/library/route";
import { filterCatalog } from "../app/lib/catalog-search";

const id = "abcdefghijk";
const metadata = { items: [{ id, snippet: { title: "  Trains   & Trucks ", channelTitle: "Kids Channel", publishedAt: "2026-09-01T10:00:00Z", description: "Learn about trains", defaultAudioLanguage: "en-US" }, contentDetails: { duration: "PT1H2M3S" }, status: { embeddable: true, privacyStatus: "public" } }] };
const stored = { youtube_id: id, title: "Trains & Trucks", channel: "Kids Channel", language: "en", topic_id: "vehicles", enabled: true, profiles: ["mira"], tags: ["поезда"] };
const classified = { choices: [{ message: { content: JSON.stringify({ topicId: "vehicles", confidence: 0.95, tags: ["Поезда", "поезда"] }) } }] };
let rows: Record<string, unknown>[];
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
  vi.stubEnv("AUTH_SESSION_SECRET", "test-parent-session-secret-at-least-32-characters");
  rows = [];
  vi.stubEnv("SUPABASE_URL", "https://database.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("LIBRARY_SESSION_SECRET", "test-session-secret-with-at-least-32-chars");
  vi.stubEnv("YOUTUBE_API_KEY", "test-youtube-key");
  vi.stubEnv("LLM_API_KEY", "test-llm-key");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("LLM_BASE_URL", "https://classifier.test/v1");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.spyOn(console, "info").mockImplementation(() => {});
  fetchMock = vi.fn(async (input: URL | string, options?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "database.test") {
      if (url.pathname === "/rest/v1/rpc/add_video_to_profile") {
        const { child_profile } = JSON.parse(options!.body as string);
        const row = rows[0];
        row.profiles = [...new Set([...(row.profiles as string[]), child_profile])];
        return json([row]);
      }
      if (options?.method !== "POST") return json(rows);
      if (rows.length) return json({ code: "23505" }, 409);
      const row = JSON.parse(options.body as string);
      rows.push(row);
      return json([row], 201);
    }
    if (url.hostname === "www.googleapis.com") return json(metadata);
    if (url.hostname === "classifier.test") return json(classified);
    throw new Error("Unexpected test request");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("library validation", () => {
  it.each([id, `https://youtu.be/${id}?t=12`, `https://www.youtube.com/watch?v=${id}&list=abc`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/watch?v=${id}`])("canonicalizes %s", value => {
    expect(normalizeVideoId(value)).toBe(id);
  });
  it.each(["", `${id}extra`, `https://youtube.com.evil.test/watch?v=${id}`, `http://youtube.com/watch?v=${id}`, `https://user@youtube.com/watch?v=${id}`, "javascript:alert(1)"])("rejects %s", value => {
    expect(() => normalizeVideoId(value)).toThrow();
  });
  it("normalizes tags and enforces their limits", () => {
    expect(normalizeTags([" Поезда  ", "ПОЕЗДА", "  big   cars  "])).toEqual(["поезда", "big cars"]);
    expect(() => normalizeTags(["a".repeat(41)])).toThrow();
    expect(() => normalizeTags(Array(11).fill("tag"))).toThrow();
    expect(() => normalizeTags([3])).toThrow();
  });
  it("extracts authoritative metadata with duration and date", () => {
    expect(parseVideoMetadata(metadata, id)).toMatchObject({ title: "Trains & Trucks", durationSeconds: 3723, durationLabel: "1:02:03", publishedAt: "2026-09-01T10:00:00.000Z", language: "en" });
    expect(() => parseVideoMetadata({ items: [] }, id)).toThrow();
    const bad = structuredClone(metadata);
    bad.items[0].snippet.publishedAt = "not a date";
    expect(() => parseVideoMetadata(bad, id)).toThrow();
    bad.items[0].status.embeddable = false;
    expect(() => parseVideoMetadata(bad, id)).toThrow(/недоступно/);
  });
  it("accepts the zero-duration format returned for live videos", () => {
    const live = structuredClone(metadata);
    live.items[0].contentDetails.duration = "P0D";
    expect(parseVideoMetadata(live, id).durationSeconds).toBe(0);
  });
  it.each([{ topicId: null, confidence: 0.1 }, { topicId: "vehicles", confidence: 0.79 }, { topicId: "made-up", confidence: 1 }, { topicId: "vehicles", confidence: 2 }])("requires manual category on uncertainty or invalid taxonomy", value => {
    expect(() => parseClassification(value)).toThrow(/Выберите/);
  });
});

describe("library persistence", () => {
  it("requires a concrete child profile before saving", async () => {
    for (const profile of [undefined, null, "Both", "un known", "x", 7]) {
      expect(() => parseLibraryInput({ videoId: id, profile })).toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("saves only for Luke, then atomically adds the same video to Mira without changing metadata", async () => {
    const first = await addLibraryVideo({ profile: "luke", videoId: id, topicId: "vehicles" });
    expect(first.video.profiles).toEqual(["luke"]);
    expect((await addLibraryVideo({ profile: "luke", videoId: id })).status).toBe("duplicate");
    const second = await addLibraryVideo({ profile: "mira", videoId: id, topicId: "songs" });
    expect(second.status).toBe("added");
    expect(second.video.profiles).toEqual(["luke", "mira"]);
    expect(second.video.topicId).toBe("vehicles");
    expect(rows).toHaveLength(1);
    expect((await addLibraryVideo({ profile: "mira", videoId: id })).status).toBe("duplicate");
  });
  it("does not call a membership save successful until the database returns the requested child", async () => {
    rows = [{ ...stored, profiles: ["luke"] }];
    fetchMock.mockImplementationOnce(async () => json(rows)).mockImplementationOnce(async () => json(rows));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "save_uncertain" });
  });

  it("uses modern Supabase secrets as API keys without treating them as JWTs", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only-key");
    await addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles" });
    const dbCalls = fetchMock.mock.calls.filter(call => String(call[0]).includes("database.test"));
    expect(dbCalls).toHaveLength(2);
    for (const call of dbCalls) {
      expect(call[1]?.headers).toMatchObject({ apikey: "sb_secret_test-only-key" });
      expect(new Headers(call[1]?.headers).has("Authorization")).toBe(false);
    }
  });
  it("saves complete metadata, category and tags, then searches the saved item", async () => {
    const result = await addLibraryVideo({ profile: "mira", url: `https://youtu.be/${id}?t=2`, tags: ["Любимое"] });
    expect(result.status).toBe("added");
    expect(result.video).toMatchObject({ id, topicId: "vehicles", title: "Trains & Trucks", channel: "Kids Channel", sourceUrl: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, durationSeconds: 3723, publishedAt: "2026-09-01T10:00:00.000Z", tags: ["любимое", "поезда"] });
    expect(rows[0]).toMatchObject({ category_source: "llm", category_model: "test-model" });
    expect(filterCatalog([result.video], "поезда")).toHaveLength(1);
    expect(filterCatalog([result.video], "Trucks")).toHaveLength(1);
  });
  it("detects a duplicate before calling YouTube or LLM and preserves category", async () => {
    rows = [{ ...stored, topic_id: "stories" }];
    const result = await addLibraryVideo({ profile: "mira", videoId: id, topicId: "songs" });
    expect(result.status).toBe("duplicate");
    expect(result.video.topicId).toBe("stories");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("resolves concurrent inserts as one success and one duplicate", async () => {
    const results = await Promise.all([addLibraryVideo({ profile: "mira", videoId: id }), addLibraryVideo({ profile: "mira", videoId: id })]);
    expect(results.map(result => result.status).sort()).toEqual(["added", "duplicate"]);
    expect(rows).toHaveLength(1);
  });
  it("keeps both profiles when two children save a new video concurrently", async () => {
    const results = await Promise.all([
      addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles" }),
      addLibraryVideo({ profile: "luke", videoId: id, topicId: "vehicles" }),
    ]);
    expect(results.map(result => result.status)).toEqual(["added", "added"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].profiles).toEqual(["mira", "luke"]);
  });
  it("does not re-enable a hidden duplicate", async () => {
    rows = [{ ...stored, enabled: false }];
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "video_disabled" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accepts a manual category without spending LLM quota", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const result = await addLibraryVideo({ profile: "mira", videoId: id, topicId: "learning", tags: ["урок"] });
    expect(result.video.topicId).toBe("learning");
    expect(rows[0]).toMatchObject({ category_source: "manual", category_model: null });
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("classifier"))).toBe(false);
  });
  it("fails gracefully on missing LLM key without saving", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "llm_not_configured", manualAllowed: true });
    expect(rows).toHaveLength(0);
  });
  it.each([401, 403, 429, 500])("handles LLM HTTP %s without saving", async status => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockImplementationOnce(async () => json({ error: "secret provider diagnostics" }, status));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: status === 401 || status === 403 ? "llm_invalid_key" : "llm_unavailable", manualAllowed: true });
    expect(rows).toHaveLength(0);
  });
  it.each([{}, { choices: [{ message: { content: "invalid json" } }] }])("handles malformed LLM output", async payload => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockImplementationOnce(async () => json(payload));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "llm_invalid_response" });
    expect(rows).toHaveLength(0);
  });
  it("handles a classifier timeout", async () => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "llm_unavailable" });
  });
  it("does not insert on low-confidence classification", async () => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockImplementationOnce(async () => json({ choices: [{ message: { content: '{"topicId":"songs","confidence":0.3}' } }] }));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "category_required" });
    expect(rows).toHaveLength(0);
  });
  it("does not report success on a database timeout or failed write", async () => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockRejectedValueOnce(new Error("private diagnostics"));
    await expect(addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles" })).rejects.toMatchObject({ code: "save_uncertain" });
    expect(rows).toHaveLength(0);
  });
  it("safely retries when the database committed but the reply was lost", async () => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockImplementationOnce(async () => { rows = [stored]; throw new Error("connection closed"); });
    await expect(addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles" })).rejects.toMatchObject({ code: "save_uncertain" });
    expect((await addLibraryVideo({ profile: "mira", videoId: id })).status).toBe("duplicate");
    expect(rows).toHaveLength(1);
  });
  it("rejects storage outage before contacting paid services", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection failed"));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed requests before network calls", async () => {
    await expect(addLibraryVideo({ profile: "mira", videoId: id, topicId: "unknown" })).rejects.toMatchObject({ code: "invalid_category" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ignores forged client metadata and rejects unavailable YouTube results", async () => {
    const result = await addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles", title: "forged", thumbnailUrl: "https://evil.test/pixel" });
    expect(result.video.title).toBe("Trains & Trucks");
    expect(result.video.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    rows = [];
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json({ items: [] }));
    await expect(addLibraryVideo({ profile: "mira", videoId: id })).rejects.toMatchObject({ code: "video_unavailable" });
    expect(rows).toHaveLength(0);
  });
  it("reports a failed database insert", async () => {
    fetchMock.mockImplementationOnce(async () => json([])).mockImplementationOnce(async () => json(metadata)).mockImplementationOnce(async () => json({ code: "PGRST204" }, 400));
    await expect(addLibraryVideo({ profile: "mira", videoId: id, topicId: "vehicles" })).rejects.toMatchObject({ code: "save_failed" });
    expect(rows).toHaveLength(0);
  });
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return familyRequest("https://library.test/api/library", { method: "POST", headers: { origin: "https://library.test", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("password-free library API", () => {
  const body = () => ({ profile: "mira", videoId: id, libraryTicket: createLibraryTicket(id) });
  it("requires a server signing secret, never a parent password", async () => {
    vi.stubEnv("LIBRARY_SESSION_SECRET", "");
    expect((await POST(request({ profile: "mira", videoId: id }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("denies missing tickets and cross-origin writes before contacting providers", async () => {
    expect((await POST(request({ profile: "mira", videoId: id }))).status).toBe(403);
    expect((await POST(request(body(), { origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(request(body(), { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("adds for a signed-in parent without a separate password, then reports duplicate", async () => {
    const input = body();
    const first = await POST(request(input));
    expect(first.status).toBe(201);
    expect(first.headers.get("set-cookie")).toBeNull();
    const second = await POST(request(input));
    expect(second.status).toBe(200);
    expect((await second.json()).status).toBe("duplicate");
    const logs = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logs).toContain("library_add_added");
    expect(logs).toContain("library_add_duplicate");
    expect(logs).not.toContain(input.libraryTicket);
    expect(logs).not.toMatch(/test-session-secret|test-service-key|test-llm-key|test-youtube-key/);
  });
  it("allows manual retry with the same ticket when the classifier is unavailable", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const input = body();
    const first = await POST(request(input));
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ code: "llm_not_configured", manualAllowed: true });
    expect((await POST(request({ ...input, topicId: "vehicles" }))).status).toBe(201);
  });
  it("rejects forged, expired and cross-video tickets", () => {
    const ticket = createLibraryTicket(id);
    expect(() => authorizeLibrary(request({}), id, ticket)).not.toThrow();
    expect(() => authorizeLibrary(request({}), "12345678901", ticket)).toThrow();
    expect(() => authorizeLibrary(request({}), id, ticket + ".extra")).toThrow();
    expect(() => authorizeLibrary(request({}), id, ticket.slice(0, -1))).toThrow();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3 * 3600_000);
    try { expect(() => authorizeLibrary(request({}), id, ticket)).toThrow(); }
    finally { vi.useRealTimers(); }
  });
  it("returns malformed-body errors without contacting providers", async () => {
    const bad = familyRequest("https://library.test/api/library", { method: "POST", body: "{" });
    expect((await POST(bad)).status).toBe(400);
    expect((await POST(request({ profile: "mira", videoId: id, padding: "x".repeat(9000) }))).status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds client and instance bursts and resets the window", () => {
    const guard = new LibraryBurstGuard();
    for (let i = 0; i < 12; i++) guard.check("one", 1000);
    expect(() => guard.check("one", 1001)).toThrow();
    for (let i = 0; i < 48; i++) guard.check(`other-${i}`, 1001);
    expect(() => guard.check("new", 1001)).toThrow();
    expect(() => guard.check("one", 61_000)).not.toThrow();
  });
});
