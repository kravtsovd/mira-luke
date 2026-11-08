import { expect, Page, test } from "@playwright/test";
import { restoreProfiles } from "../../app/lib/profiles";
import { NAME_CARDS } from "../../app/lib/huntrix";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

test.beforeEach(async ({ page }) => { await installProfileSettingsFixture(page); });

async function openGame(page: Page) {
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-mira").click();
  await menu.getByTestId("quick-games").click();
  await expect(page.getByTestId("huntrix-game")).toBeVisible();
}
async function solveSyllables(page: Page) {
  for (let step = 0; step < 3; step++) {
    await expect(page.getByTestId("name-slots")).toHaveAttribute("data-ready", "false");
    const id = await page.locator(".syllables-portrait img").getAttribute("data-card");
    const card = NAME_CARDS.find(item => item.id === id)!;
    for (const syllable of card.syllables) {
      await page.locator(".syllables-tile:not([disabled])").filter({ hasText: new RegExp(`^${syllable}$`) }).first().click();
    }
  }
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
}

test("Huntrix: only syllables open on repeat, with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGame(page);
  await expect(page.getByTestId("huntrix-game")).toHaveAttribute("data-mode", "syllables");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
  await openGame(page);
  await expect(page.getByTestId("huntrix-game")).toHaveAttribute("data-mode", "syllables");
  await solveSyllables(page);
  const completed = await page.evaluate(() => JSON.parse(localStorage.getItem("mira-name-progress-v1") || "{}"));
  expect(Object.values(completed).filter((result: unknown) => (result as { rounds: number }).rounds > 0)).toHaveLength(3);
  await page.reload();
  await page.getByTestId("pause-catalog").getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("name-progress").locator("li")).toHaveCount(NAME_CARDS.length);
  await expect(page.getByTestId("name-progress").getByText("Без ошибок: 1 из 1").first()).toBeVisible();
});

test("Huntrix: older Mira profiles get only Huntrix every ten minutes; saved changes persist and Luke is unchanged", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mira-luke-profiles-v1", JSON.stringify({ activeProfile: "mira", settings: { mira: { enabledGames: ["letters"], learningEnabled: true, intervalMinutes: 5 } } })));
  await page.reload();
  const menu = page.getByTestId("pause-catalog");
  await menu.getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("game-toggle-huntrix")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("interval-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid^="game-toggle-"][aria-pressed="true"]')).toHaveCount(1);
  await page.getByTestId("save-settings").click();
  await expect(page.getByTestId("settings-dialog")).toHaveCount(0);
  await page.reload();
  await menu.getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("interval-10")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("game-toggle-huntrix")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-testid^="game-toggle-"][aria-pressed="true"]')).toHaveCount(1);
  await page.getByTestId("game-toggle-letters").click();
  await page.getByTestId("game-toggle-huntrix").click();
  await page.getByTestId("interval-15").click();
  await page.getByTestId("save-settings").click();
  await expect(page.getByTestId("settings-dialog")).toHaveCount(0);
  await page.reload();
  await menu.getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("game-toggle-huntrix")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("interval-15")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await menu.getByTestId("profile-luke").click();
  await menu.getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("test-game-huntrix")).toHaveCount(0);
});

test("Huntrix: iPad classic timed pause resumes the real video after the third answer", async ({ page }) => {
  test.setTimeout(90_000);
  const profiles = restoreProfiles(null);
  profiles.settings.mira.intervalMinutes = 3 / 60;
  await installProfileSettingsFixture(page, profiles);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mira-luke-profiles-v1") || "{}").settings?.mira?.intervalMinutes)).toBe(3 / 60);
  await page.getByTestId("pause-catalog").locator(".kids-video-card").first().click();
  const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.readyState >= 2)).toBe(true);
  await expect(page.getByTestId("huntrix-game")).toBeVisible({ timeout: 12_000 });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await solveSyllables(page);
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  const at = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(at + 0.5);
});
