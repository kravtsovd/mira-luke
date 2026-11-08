import { expect, test } from "@playwright/test";
import { NAME_CARDS } from "../../app/lib/huntrix";

async function solveName(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("name-slots")).toHaveAttribute("data-ready", "false");
  const id = await page.locator(".syllables-portrait img").getAttribute("data-card");
  const card = NAME_CARDS.find(item => item.id === id)!;
  for (const syllable of card.syllables) {
    await page.locator(".syllables-tile:not([disabled])").filter({ hasText: new RegExp(`^${syllable}$`) }).first().click();
  }
}

test("Huntrix direct URL opens syllables on load and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/games/huntrix");
  await expect(page.getByTestId("huntrix-game")).toHaveAttribute("data-mode", "syllables");
  await expect(page.locator(".huntrix-word, .huntrix-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".syllables-portrait img")).toBeVisible();
  await expect.poll(() => page.locator(".syllables-portrait img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (let step = 0; step < 3; step++) await solveName(page);
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an error restarts only the current name with all four choices", async ({ page }, testInfo) => {
  await page.goto("/games/huntrix");
  await solveName(page);
  await expect(page.getByTestId("name-slots")).toHaveAttribute("data-ready", "false");
  const id = await page.locator(".syllables-portrait img").getAttribute("data-card");
  const card = NAME_CARDS.find(item => item.id === id)!;
  const tiles = page.locator(".syllables-tile");
  await tiles.filter({ hasText: new RegExp(`^${card.syllables[0]}$`) }).first().click();
  await expect(page.getByTestId("slot-1")).toHaveText(card.syllables[0]);
  await expect(page.locator(".syllables-tile:enabled")).toHaveCount(4);
  const wrong = (await tiles.allTextContents()).find(tile => tile !== card.syllables[1])!;
  await page.clock.install();
  await tiles.filter({ hasText: new RegExp(`^${wrong}$`) }).first().click();
  await expect(page.getByTestId("slot-1")).toBeEmpty();
  await expect(page.getByTestId("slot-2")).toBeEmpty();
  await expect(page.getByText("Попробуем имя сначала")).toBeVisible();
  await expect(page.locator(".syllables-tile:disabled")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("reset-name.png") });
  await page.clock.runFor(850);
  await expect(page.locator(".syllables-tile:enabled")).toHaveCount(4);
  await expect(page.locator(".syllables-portrait img")).toHaveAttribute("data-card", id!);
  await expect(page.locator('[data-hint="true"]')).toHaveCount(0);
  await solveName(page);
  await page.clock.runFor(1350);
  await solveName(page);
  await page.clock.runFor(1450);
  await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
});

for (const size of [
  { name: "phone", width: 390, height: 844 },
  { name: "phone landscape", width: 667, height: 375 },
  { name: "iPad", width: 768, height: 1024 },
  { name: "iPad landscape", width: 1024, height: 768 },
]) {
  test(`Huntrix syllable layout on ${size.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.goto("/games/huntrix");
    await expect(page.locator(".syllables-tile")).toHaveCount(4);
    for (const tile of await page.locator(".syllables-tile").all()) {
      const box = await tile.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`${size.name}.png`) });
    await page.getByRole("button", { name: "Закрыть игру" }).click();
    await expect(page.getByTestId("huntrix-game")).toHaveCount(0);
  });
}
