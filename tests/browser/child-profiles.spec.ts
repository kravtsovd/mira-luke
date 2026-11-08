import { expect, Page, test } from "@playwright/test";
import { profileSettings, restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

const menu = (page: Page) => page.getByTestId("pause-catalog");
const openAdults = (page: Page) => menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();

test("an adult adds a toddler, switches to them, and the toddler gets Luke's car games", async ({ page }, testInfo) => {
  const rows = await installProfileSettingsFixture(page);
  await page.goto("/");
  await expect(page.getByTestId("profile-picker")).toHaveCount(0);
  await openAdults(page);
  await expect(page.getByTestId("child-profiles")).toBeVisible();
  await expect(page.getByTestId("child-delete-mira")).toHaveCount(0);
  await page.getByTestId("child-add").click();
  await page.getByTestId("child-name").fill("Ваня");
  await page.getByRole("radio", { name: "🦊" }).click();
  await page.getByTestId("child-kind-toddler").click();
  await page.screenshot({ path: testInfo.outputPath("add-child-form.png"), fullPage: true });
  await page.getByTestId("child-create").click();
  await expect(page.getByTestId("child-switch-created")).toBeVisible();
  expect(rows.map(row => row.name)).toEqual(["Mira", "Luke", "Ваня"]);
  const id = rows[2].profile;
  await page.getByTestId("child-switch-created").click();
  await expect(page.getByTestId("settings-dialog")).toHaveCount(0);
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", id);
  await expect(menu(page).getByTestId(`profile-${id}`)).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("three-children-menu.png") });
  await openAdults(page);
  await expect(page.getByRole("heading", { name: "Настройки · Ваня" })).toBeVisible();
  await expect(page.getByTestId("test-game-cars")).toBeVisible();
  await expect(page.getByTestId("test-game-huntrix")).toHaveCount(0);
  await expect(page.getByTestId("interval-5")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("test-game-cars").click();
  await expect(page.getByTestId("car-game")).toBeVisible();
});

test("a new device in a family of three asks who is watching, once", async ({ page }, testInfo) => {
  const store = restoreProfiles(null);
  store.profiles.push({ id: "c-anya00000000", name: "Аня", avatar: "🐰", kind: "preschool" });
  store.settings["c-anya00000000"] = profileSettings("c-anya00000000", undefined, "preschool");
  await installProfileSettingsFixture(page, store);
  await page.goto("/");
  await expect(page.getByTestId("profile-picker")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("who-is-watching.png") });
  await page.getByTestId("pick-profile-c-anya00000000").click();
  await expect(page.getByTestId("profile-picker")).toHaveCount(0);
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "c-anya00000000");
  await page.reload();
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "c-anya00000000");
  await expect(page.getByTestId("profile-picker")).toHaveCount(0);
  await openAdults(page);
  await expect(page.getByTestId("test-game-letters")).toBeVisible();
  await expect(page.getByTestId("test-game-cars")).toHaveCount(0);
});

test("deleting the watching child on this device returns the screen to Mira", async ({ page }) => {
  const store = restoreProfiles(null);
  store.profiles.push({ id: "c-anya00000000", name: "Аня", avatar: "🐰", kind: "preschool" });
  store.settings["c-anya00000000"] = profileSettings("c-anya00000000", undefined, "preschool");
  store.activeProfile = "c-anya00000000";
  store.chosen = true;
  await installProfileSettingsFixture(page, store);
  await page.addInitScript(value => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("mira-luke-profiles-v1", value); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(store));
  await page.goto("/");
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "c-anya00000000");
  await openAdults(page);
  await page.getByTestId("child-edit-c-anya00000000").click();
  await page.getByTestId("child-edit-name").fill("Анечка");
  await page.getByTestId("child-edit-save").click();
  await expect(page.getByTestId("child-row-c-anya00000000")).toContainText("Анечка");
  await page.getByTestId("child-delete-c-anya00000000").click();
  await page.getByTestId("child-delete-confirm-c-anya00000000").click();
  await expect(page.getByTestId("child-row-c-anya00000000")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть настройки" }).click();
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "mira");
  await expect(menu(page).getByTestId("profile-c-anya00000000")).toHaveCount(0);
});
