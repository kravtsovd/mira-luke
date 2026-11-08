import { familyRequest } from "./helpers/family-request";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET, POST } from "../app/api/game-progress/route";
import { applyRound, freshProgress } from "../app/lib/english-find";

// A fake Supabase Storage: one object per path, a bucket that may not exist yet.
let objects: Map<string, string>;
let bucket: boolean;
let client = 0;
const post = (body: unknown, origin = "https://app.test") => familyRequest("https://app.test/api/game-progress", {
  method: "POST", headers: { origin, "x-vercel-forwarded-for": `client-${client++}` }, body: JSON.stringify(body),
});
const round = (id: string, level = 1, clean = true) => ({ profile: "mira", round: { id, level, clean } });

beforeEach(() => {
  vi.stubEnv("AUTH_SESSION_SECRET", "test-parent-session-secret-at-least-32-characters");
  objects = new Map();
  bucket = false;
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubGlobal("fetch", vi.fn(async (input: URL, options: RequestInit = {}) => {
    expect(options.cache).toBe("no-store");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer test-server-key");
    const path = input.pathname;
    if (path === "/storage/v1/bucket") { bucket = true; return Response.json({ name: "game-progress" }); }
    const read = path.match(/^\/storage\/v1\/object\/authenticated\/(.+)$/);
    if (read) return objects.has(read[1]) ? new Response(objects.get(read[1])) : Response.json({ error: "not_found" }, { status: 400 });
    const write = path.match(/^\/storage\/v1\/object\/(.+)$/);
    if (write && options.method === "POST") {
      if (!bucket) return Response.json({ error: "Bucket not found" }, { status: 404 });
      objects.set(write[1], options.body as string);
      return Response.json({ Key: write[1] });
    }
    throw new Error(`unexpected ${path}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("keeps one shared progress for every device, creates the private bucket once and never counts a retried round twice", async () => {
  expect((await (await GET(familyRequest("https://app.test/api/game-progress?profile=mira"))).json()).progress).toEqual(freshProgress());

  // Two "devices" each finish a clean round; the third round comes from the first device again.
  for (const id of ["ipad-round-0001", "phone-round-0001", "ipad-round-0002"]) {
    const response = await POST(post(round(id)));
    expect(response.status).toBe(200);
  }
  expect(bucket).toBe(true);
  const retried = await (await POST(post(round("phone-round-0001")))).json();
  expect(retried).toMatchObject({ duplicate: true });

  const shared = (await (await GET(familyRequest("https://app.test/api/game-progress?profile=mira"))).json()).progress;
  expect(shared).toMatchObject({ level: 2, stars: 0, streak: 0, rounds: 3, cleanRounds: 3 });
  expect(shared.levels[1]).toEqual({ clean: 3, miss: 0 });
  const stored = JSON.parse(objects.get("game-progress/mira/english-find.json")!);
  expect(stored.roundIds).toEqual(["ipad-round-0001", "phone-round-0001", "ipad-round-0002"]);
});

it("rejects other sites, other profiles and malformed rounds", async () => {
  expect((await POST(post(round("ipad-round-0001"), "https://evil.test"))).status).toBe(403);
  expect((await POST(post({ profile: "luke", round: { id: "ipad-round-0001", level: 1, clean: true } }))).status).toBe(400);
  expect((await POST(post(round("x", 1)))).status).toBe(400);
  expect((await POST(post(round("ipad-round-0001", 7)))).status).toBe(400);
  expect((await GET(familyRequest("https://app.test/api/game-progress?profile=luke"))).status).toBe(400);
  expect(objects.size).toBe(0);
});

it("counts a late round from a level another device already passed only in that level's statistics", () => {
  const onLevel2 = { ...freshProgress(2, 1), streak: 1 };
  const late = applyRound(onLevel2, { id: "old-ipad-round", level: 1, clean: false });
  expect(late).toMatchObject({ levelUp: false, progress: { level: 2, stars: 1, streak: 1, rounds: 1 } });
  expect(late.progress.levels[1]).toEqual({ clean: 0, miss: 1 });
  expect(applyRound(onLevel2, { id: "current-round", level: 2, clean: true }).progress).toMatchObject({ stars: 2, streak: 2 });
});
