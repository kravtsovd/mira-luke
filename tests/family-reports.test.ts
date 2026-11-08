import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GET as REPORT } from "../app/family/report/[file]/route";
import { GET as LIST } from "../app/api/family/reports/route";
import { newSession, signValue } from "../app/lib/auth";

const rows = [{ family_id: "demo", name: "viewer.html", html: "<html>Мира</html>", updated_at: "2026-10-11T22:00:00Z" }];
const cookie = (family: string) => `ml_session=${encodeURIComponent(signValue(newSession("p@example.test", family)))}`;
const get = (path: string, c = "") => new Request(`https://app.test${path}`, { headers: c ? { cookie: c } : {} });
const params = (file: string) => ({ params: Promise.resolve({ file }) });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://db.test"); vi.stubEnv("SUPABASE_SECRET_KEY", "k"); vi.stubEnv("AUTH_SESSION_SECRET", "x".repeat(40));
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const url = new URL(String(input)); const eq = (n: string) => url.searchParams.get(n)?.replace(/^eq\./, "");
    return Response.json(rows.filter(r => r.family_id === eq("family_id") && (!eq("name") || r.name === eq("name"))));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("serves the family's own page, privately", async () => {
  // Without PostHog the fresh read falls back to the page as it was stored.
  const response = await REPORT(get("/family/report/viewer.html?data=live", cookie("demo")), params("viewer.html"));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Мира");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("sends signed-out visitors to sign-in and never shows another family's page", async () => {
  const signedOut = await REPORT(get("/family/report/viewer.html"), params("viewer.html"));
  expect(signedOut.status).toBe(302);
  expect(signedOut.headers.get("location")).toContain("/api/auth/google?return=%2Ffamily%2Freport%2Fviewer.html");
  const other = await REPORT(get("/family/report/viewer.html", cookie("zhan")), params("viewer.html"));
  expect(other.status).toBe(404);
  expect(await other.text()).not.toContain("Мира");
  expect((await REPORT(get("/family/report/x.html", cookie("demo")), params("../secret"))).status).toBe(404);
});
it("lists only the family's pages", async () => {
  expect((await (await LIST(get("/api/family/reports", cookie("demo")))).json()).reports.map((r: { name: string }) => r.name)).toEqual(["viewer.html"]);
  expect((await (await LIST(get("/api/family/reports", cookie("zhan")))).json()).reports).toEqual([]);
  expect((await LIST(get("/api/family/reports"))).status).toBe(401);
});
