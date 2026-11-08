import { expect, Page, test } from "@playwright/test";
import { CAR_PUZZLE_ROUNDS, PUZZLE_VEHICLES } from "../../app/lib/car-puzzle";
import { SPEECH_AUDIO_PATHS } from "../../app/lib/speech";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

// Two cars per game, two halves per car. The first half never advances the round.
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*posthog\.(com|us|eu)\//, route => route.abort());
  const profiles = restoreProfiles(null);
  profiles.settings.luke.enabledGames = ["cars", "car-puzzle"];
  await installProfileSettingsFixture(page, profiles);
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() { this.muted = true; return play.call(this); };
    document.addEventListener("playing", event => {
      const audio = event.target as HTMLAudioElement;
      if (audio.id === "game-voice-audio") audio.dataset.playedVoice = audio.dataset.voicePath;
    }, true);
  });
});
const game = (page: Page) => page.getByTestId("car-puzzle-game");
async function open(page: Page) {
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-luke").click();
  await menu.getByTestId("quick-games").click();
  await page.getByTestId("quick-game-car-puzzle").click();
  await expect(game(page)).toHaveAttribute("data-round", "0");
}
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}
const centre = (rect: { x: number; y: number; width: number; height: number }) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

test("iPad classic: two halves form the whole car, wrong places retry and finishing requires two complete cars", async ({ page }, testInfo) => {
  await open(page);
  const vehicle = await game(page).getAttribute("data-vehicle");
  const prompt = PUZZLE_VEHICLES.find(v => v.id === vehicle)!.prompt;
  await expect(page.locator("#toddler-title")).toHaveText(prompt);
  await expect(page.locator(".toddler-progress > span")).toHaveCount(CAR_PUZZLE_ROUNDS);
  await expect(page.locator(".puzzle-piece")).toHaveCount(2);
  const left = page.getByTestId("puzzle-piece-left");
  await expect(left).toHaveCSS("touch-action", "none");
  const box = (await left.boundingBox())!;
  expect(box.width).toBeGreaterThan(90);
  expect(box.height).toBeGreaterThan(120);
  await left.click();
  await expect(game(page)).toHaveAttribute("data-placed-count", "0");
  // A wrong half is never accepted.
  const rightSlot = page.getByTestId("puzzle-slot-right");
  await dragTo(page, centre((await left.boundingBox())!), centre((await rightSlot.boundingBox())!));
  await expect(game(page).getByRole("status")).toHaveText("Попробуй другое место");
  await expect(game(page)).toHaveAttribute("data-placed-count", "0");
  const leftSlot = page.getByTestId("puzzle-slot-left");
  await dragTo(page, centre((await left.boundingBox())!), centre((await leftSlot.boundingBox())!));
  await expect(leftSlot).toHaveAttribute("data-placed", "true");
  await expect(game(page)).toHaveAttribute("data-round", "0");
  await expect(game(page)).toHaveAttribute("data-phase", "drag");
  await expect(game(page)).toHaveAttribute("data-placed-count", "1");
  await page.screenshot({ path: testInfo.outputPath("puzzle-first-half.png") });
  // The second half also works by tapping the piece and its place.
  await page.getByTestId("puzzle-piece-right").click();
  await rightSlot.click();
  await expect(game(page)).toHaveAttribute("data-phase", "success");
  await expect(game(page)).toHaveAttribute("data-placed-count", "2");
  await page.screenshot({ path: testInfo.outputPath("puzzle-complete.png") });
  await expect(game(page)).toHaveAttribute("data-round", "1");
  expect(await game(page).getAttribute("data-vehicle")).not.toBe(vehicle);
  await expect(game(page)).toHaveAttribute("data-placed-count", "0");
  // Keyboard access and the round transition lock.
  await page.getByTestId("puzzle-piece-left").press("Enter");
  await expect(game(page)).toHaveAttribute("data-phase", "drag");
  await page.getByTestId("puzzle-piece-right").press("Space");
  await expect(game(page)).toHaveCount(0);
});

test("iPad classic: the puzzle fits rotation and respects sound off", async ({ page }, testInfo) => {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.soundEnabled = false;
  profiles.settings.luke.enabledGames = ["cars", "car-puzzle"];
  await installProfileSettingsFixture(page, profiles);
  await open(page);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const geometry = await game(page).evaluate(el => ({ width: el.scrollWidth, clientWidth: el.clientWidth, height: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.clientHeight);
    await page.screenshot({ path: testInfo.outputPath(`car-puzzle-${viewport.width}.png`) });
  }
  expect(await page.locator("#game-voice-audio").count()).toBe(0);
});

test("Luke can drag both puzzle halves with a finger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "touch", "Touch browser only");
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  for (const half of ["left", "right"]) {
    const start = centre((await page.getByTestId(`puzzle-piece-${half}`).boundingBox())!);
    const end = centre((await page.getByTestId(`puzzle-slot-${half}`).boundingBox())!);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await expect(game(page)).toHaveAttribute("data-phase", "success");
});
