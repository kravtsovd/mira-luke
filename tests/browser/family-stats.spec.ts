import { expect, Page, test } from "@playwright/test";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

const day = (date: string, minutes: number, rounds: number) => ({ date, minutes, videos: rounds ? 2 : 0, rounds, answers: rounds * 3, correct: rounds * 2 });
const dates = Array.from({ length: 14 }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`);
const stats = {
  generatedAt: "2026-10-14T20:00:00.000Z", days: 14, timezone: "America/Los_Angeles",
  children: [
    { profile: "mira", minutes: 95, rounds: 4, days: dates.map((date, index) => day(date, index === 13 ? 95 : 0, index === 13 ? 4 : 0)),
      games: [{ game: "english-find", title: "Find it! Английский на слух", rounds: 4, answers: 12, accuracy: 0.92, errorsPerRound: 0.3, recentSeconds: 14, earlierSeconds: 20, daysPlayed: 5, lastPlayed: "2026-10-14T18:00:00.000Z" }],
      videos: [{ id: "aaaaaaaaaaa", title: "Песенка", minutes: 40, starts: 2 }] },
    { profile: "luke", minutes: 30, rounds: 2, days: dates.map((date, index) => day(date, index === 12 ? 30 : 0, index === 12 ? 2 : 0)),
      games: [{ game: "luke-count", title: "Люки и машинки", rounds: 2, answers: 6, accuracy: 0.5, errorsPerRound: 1.5, recentSeconds: 60, earlierSeconds: 40, daysPlayed: 1, lastPlayed: "2026-10-13T18:00:00.000Z" }],
      videos: [] },
  ],
};

async function signIn(page: Page) {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { signedIn: true, email: "dad@example.test", userName: "Dad", family: { id: "demo", name: "Демо-семья" }, googleConfigured: true } }));
  await page.route("**/api/family/parents", route => route.fulfill({ json: { parents: ["dad@example.test"], you: "dad@example.test" } }));
}
const openAdults = (page: Page) => page.getByTestId("pause-catalog").getByRole("button", { name: "Для взрослых", exact: true }).click();

test("a signed-in parent sees each child's watching and games", async ({ page }, testInfo) => {
  await installProfileSettingsFixture(page);
  await signIn(page);
  await page.route("**/api/family/stats", route => route.fulfill({ json: stats }));
  await page.goto("/");
  await openAdults(page);
  const panel = page.getByTestId("family-stats");
  await expect(panel.getByRole("heading", { name: "Статистика за 14 дней" })).toBeVisible();
  await expect(panel.getByTestId("stats-minutes")).toHaveText("1 ч 35 мин");
  await expect(panel.getByTestId("stats-games")).toContainText("Find it! Английский на слух");
  await expect(panel.getByTestId("stats-games")).toContainText("92%");
  await expect(panel).toContainText("Песенка");
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("stats-mira.png"), fullPage: true });
  await panel.getByTestId("stats-tab-luke").click();
  await expect(panel.getByTestId("stats-minutes")).toHaveText("30 мин");
  await expect(panel.getByTestId("stats-games")).toContainText("новая");
  await expect(panel.getByTestId("stats-games")).toContainText("было 40 с");
});

test("the home screen shows the parent is signed in and opens statistics in one tap", async ({ page }, testInfo) => {
  await installProfileSettingsFixture(page);
  await signIn(page);
  await page.route("**/api/family/stats", route => route.fulfill({ json: stats }));
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await expect(menu.getByTestId("account-badge")).toBeVisible();
  await expect(menu.getByTestId("account-badge")).toHaveAttribute("title", "Вы вошли как dad@example.test");
  await expect(menu.getByTestId("sign-in")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("home-signed-in.png") });
  await menu.getByTestId("stats-open").click();
  const dialog = page.getByTestId("stats-dialog");
  await expect(dialog.getByTestId("stats-minutes")).toHaveText("1 ч 35 мин");
  await page.screenshot({ path: testInfo.outputPath("stats-dialog.png") });
  await dialog.getByTestId("stats-close").click();
  await expect(dialog).toHaveCount(0);
  await menu.getByTestId("account-badge").click();
  await expect(page.getByTestId("signed-in-email")).toHaveText("dad@example.test");
});

test("a signed-out visitor sees no statistics section", async ({ page }) => {
  await installProfileSettingsFixture(page);
  await page.route("**/api/auth/session", route => route.fulfill({ json: { signedIn: false, family: null, googleConfigured: true } }));
  let asked = false;
  await page.route("**/api/family/stats", route => { asked = true; return route.fulfill({ status: 401, json: {} }); });
  await page.goto("/");
  await expect(page.getByTestId("family-welcome")).toBeVisible();
  await expect(page.getByTestId("create-family")).toBeVisible();
  await expect(page.getByTestId("family-stats")).toHaveCount(0);
  await expect(page.getByTestId("stats-open")).toHaveCount(0);
  await expect(page.getByTestId("account-badge")).toHaveCount(0);
  expect(asked).toBe(false);
});

test("a missing PostHog key reads as not connected yet", async ({ page }) => {
  await installProfileSettingsFixture(page);
  await signIn(page);
  await page.route("**/api/family/stats", route => route.fulfill({ status: 503, json: { error: "Статистика ещё не подключена.", reason: "not_configured" } }));
  await page.goto("/");
  await openAdults(page);
  await expect(page.getByTestId("family-stats")).toContainText("Статистика ещё не подключена.");
});
