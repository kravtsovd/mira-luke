import { expect, test } from "@playwright/test";
import { CartoonVideo } from "../../app/data/catalog";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

test("switching profiles replaces the video shelf with personal newest-first picks", async ({ page, request }, testInfo) => {
  await installProfileSettingsFixture(page);
  const { items } = await (await request.get("/api/catalog")).json() as { items: CartoonVideo[] };
  await page.route("**/api/catalog", route => route.fulfill({ json: { source: "database", items } }));
  await page.goto("/?theme=vehicles");
  const menu = page.getByTestId("pause-catalog");
  for (const profile of ["luke", "mira", "luke"] as const) {
    await menu.getByTestId(`profile-${profile}`).click();
    await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", profile);
    await expect(page).not.toHaveURL(/theme=/);
    const personal = items.filter(v => v.profiles?.length === 1 && v.profiles[0] === profile)
      .sort((a, b) => (Date.parse(b.addedAt ?? "") || 0) - (Date.parse(a.addedAt ?? "") || 0));
    expect(personal.length).toBeGreaterThan(0);
    const cards = menu.locator(".kids-card-list > button");
    await expect(cards.first()).toHaveAttribute("data-testid", `kids-video-${personal[0].id}`);
    const ids = await cards.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-testid")?.replace("kids-video-", "")));
    expect(ids.slice(0, personal.length)).toEqual(personal.map(v => v.id));
    const otherOnly = items.filter(v => v.profiles?.length === 1 && !v.profiles.includes(profile));
    expect(ids.filter(id => otherOnly.some(v => v.id === id))).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`shelf-${profile}.png`) });
  }
});

test("each launcher contains only its enabled games even when the server returns another child's ID", async ({ page }) => {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.enabledGames = ["cars", "car-voices", "huntrix"];
  profiles.settings.mira.enabledGames = ["colors", "cars"];
  await installProfileSettingsFixture(page, profiles);
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-luke").click();
  await menu.getByTestId("quick-games").click();
  const picker = page.getByRole("dialog", { name: "Игры Luke" });
  await expect(picker.getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("quick-game-car-voices")).toBeVisible();
  await expect(page.getByTestId("quick-game-huntrix")).toHaveCount(0);
  await expect(page.getByTestId("quick-game-car-workshop")).toHaveCount(0);
  await page.getByTestId("quick-game-car-voices").click();
  await expect(page.getByTestId("toddler-game")).toHaveAttribute("data-game", "car-voices");
  await expect(page.getByTestId("game-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть игру", exact: true }).click();
  await menu.getByTestId("profile-mira").click();
  await menu.getByTestId("quick-games").click();
  await expect(page.getByTestId("game-dialog")).toBeVisible();
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
});
