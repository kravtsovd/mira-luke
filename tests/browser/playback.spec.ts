import { expect, Page, test } from "@playwright/test";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

async function expectPlayback(page: Page) {
  await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
  const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) =>
    !element.paused && !element.muted && element.readyState >= 2)).toBe(true);
  const startedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(startedAt + 1);
}

async function chooseFirst(page: Page) {
  const card = page.getByTestId("pause-catalog").locator(".kids-video-card").first();
  await expect(card).toBeVisible();
  await card.click();
}

test("cold home selection starts with sound after exactly one card click", async ({ page }) => {
  await page.goto("/");
  await chooseFirst(page);
  await expectPlayback(page);
});

test("selection survives delayed YouTube API readiness", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto("/");
  await chooseFirst(page);
  await expectPlayback(page);
});

test("pause stays paused beyond the retry window; resume and source switch reuse the iframe", async ({ page }) => {
  await page.goto("/");
  await chooseFirst(page);
  await expectPlayback(page);
  const iframe = await page.locator('iframe[src*="youtube.com/embed/"]').elementHandle();
  await page.getByTestId("player-tap-pause").click();
  await expect(page.getByTestId("pause-resume")).toBeVisible();
  await page.waitForTimeout(10_500);
  const media = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  expect(await media.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.getByTestId("pause-resume").click();
  await expectPlayback(page);
  await page.getByTestId("player-tap-pause").click();
  const currentId = new URL(page.url()).searchParams.get("video");
  const nextCard = page.getByTestId("pause-catalog").locator(`.kids-video-card:not([data-testid="kids-video-${currentId}"])`).first();
  const nextId = (await nextCard.getAttribute("data-testid"))!.replace("kids-video-", "");
  await nextCard.click();
  await expect(page).toHaveURL(new RegExp(`video=${nextId}`));
  await expectPlayback(page);
  expect(await iframe!.evaluate(element => element.isConnected)).toBe(true);
});

// The tap layer hides YouTube's own progress bar, so the scrubber is ours. Drop the thumb in the middle and read the real media clock to prove the jump landed and playback kept going.
test("cold home selection then dragging the scrubber moves the real media clock without pausing", async ({ page }) => {
  // The settings-server notice would otherwise sit over the bottom edge where the scrubber lives.
  await installProfileSettingsFixture(page);
  await page.goto("/");
  await chooseFirst(page);
  // WebKit sometimes refuses the cold autoplay; a child then taps the picture. Wait for the start first: a tap that lands just as playback begins would pause instead.
  const tap = page.getByTestId("player-tap-pause");
  await expect(tap).toBeVisible();
  await expect(tap).toHaveAttribute("data-playing", "true", { timeout: 8000 }).catch(() => tap.click());
  await expectPlayback(page);
  const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  const range = page.getByTestId("player-scrubber-range");
  await expect(range).toBeVisible();
  const duration = Number(await range.getAttribute("max"));
  expect(duration).toBeGreaterThan(60);
  const box = (await range.boundingBox())!;
  await range.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(duration * 0.4);
  await expect(tap).toHaveAttribute("data-playing", "true");
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await range.click({ position: { x: box.width * 0.1, y: box.height / 2 } });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeLessThan(duration * 0.25);
  await expect(tap).toHaveAttribute("data-playing", "true");
  await expect(page.getByTestId("pause-resume")).toHaveCount(0);
});
