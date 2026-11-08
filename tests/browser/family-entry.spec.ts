import { expect, test } from "@playwright/test";
import { installProfileSettingsFixture } from "./helpers/profile-settings";
import { restoreProfiles } from "../../app/lib/profiles";

const signedOut = { signedIn: false, family: null, googleConfigured: true };

test("a new visitor can register without seeing cached family data", async ({ page }, info) => {
  const familyRequests: string[] = [];
  await page.addInitScript(() => localStorage.setItem("mira-luke-profiles-v1", JSON.stringify({ profiles: [{ id: "mira", name: "Private child", avatar: "🌸", kind: "mira" }] })));
  await page.route("**/api/auth/session", route => route.fulfill({ json: signedOut }));
  page.on("request", request => { if (/\/api\/(profile-settings|profiles|catalog|family\/)/.test(request.url())) familyRequests.push(request.url()); });
  await page.goto("/");
  await expect(page.getByTestId("create-family")).toBeVisible();
  await expect(page.getByTestId("family-welcome")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("family-sign-in")).toBeVisible();
  await expect(page.getByText("Private child")).toHaveCount(0);
  await expect(page.getByTestId("app-root")).toHaveCount(0);
  expect(familyRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("family-entry.png"), fullPage: true });
  await page.route("**/api/auth/google*", route => route.fulfill({ status: 200, contentType: "text/plain", body: "Google sign-in started" }));
  await page.getByTestId("create-family").click();
  await expect(page).toHaveURL(/\/api\/auth\/google/);
});

test("a new signed-in family starts with its own empty child list", async ({ page }) => {
  await installProfileSettingsFixture(page, restoreProfiles({ profiles: [], chosen: false }));
  await page.route("**/api/auth/session", route => route.fulfill({ json: { signedIn: true, email: "new@example.test", family: { id: "f-new", name: "Новая семья" }, googleConfigured: true } }));
  await page.goto("/?welcome=1");
  await expect(page.getByTestId("family-onboarding")).toBeVisible();
  await expect(page.getByTestId("family-welcome")).toHaveCount(0);
  await expect(page.getByTestId("profile-mira")).toHaveCount(0);
  await page.getByTestId("child-add").click();
  await page.getByTestId("child-name").fill("Тест");
  await page.getByTestId("child-create").click();
  await expect(page.getByTestId("welcome-library")).toBeVisible();
  await page.getByTestId("welcome-catalog").click();
  await expect(page.getByTestId("family-onboarding")).toHaveCount(0);
  await expect(page.getByTestId("pause-catalog")).toBeVisible();
});

test("failed sign-in stays on a usable entry screen", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: signedOut }));
  await page.goto("/?login=expired");
  await expect(page.getByTestId("family-welcome").getByRole("alert")).toContainText("We couldn't sign you in");
  await expect(page.getByTestId("create-family")).toBeVisible();
});

test("anonymous requests cannot read family settings or create a child", async ({ request }) => {
  expect((await request.get("/api/auth/session")).ok()).toBe(true);
  expect((await (await request.get("/api/auth/session")).json()).family).toBeNull();
  expect((await request.get("/api/profile-settings")).status()).toBe(401);
  const base = process.env.PLAYBACK_BASE_URL ?? "http://localhost:3210";
  expect((await request.post("/api/profiles", { headers: { origin: base }, data: { name: "Тест", avatar: "⭐", kind: "toddler" } })).status()).toBe(401);
});

for (const button of ["create-family", "family-sign-in"]) {
  test(`embedded ${button} opens sign-in in the main window`, async ({ page }) => {
    await page.route("**/api/auth/session", route => route.fulfill({ json: signedOut }));
    await page.route("**/__signin_frame__", route => route.fulfill({ contentType: "text/html", body: '<iframe src="/?theme=songs" style="width:100%;height:1200px" title="Game"></iframe>' }));
    let returnTo: string | null = null;
    await page.route("**/api/auth/google*", route => {
      const url = new URL(route.request().url());
      returnTo = url.searchParams.get("return");
      return route.fulfill({ status: 302, headers: { Location: new URL("/__signin_destination__", url).toString() } });
    });
    await page.route("**/__signin_destination__", route => route.fulfill({ contentType: "text/html", body: "<h1>Google sign-in started</h1>" }));
    await page.goto("/__signin_frame__");
    await page.frameLocator('iframe[title="Game"]').getByTestId(button).click();
    await expect(page).toHaveURL(/\/__signin_destination__$/);
    expect(returnTo).toBe("/?theme=songs");
  });
}
