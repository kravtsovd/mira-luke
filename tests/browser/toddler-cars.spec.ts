import { expect, Page, test } from "@playwright/test";
import { HIDE_FIND, PARTS, TODDLER_CAR_GAMES, TODDLER_ROUNDS, ToddlerCarGame, VEHICLES } from "../../app/lib/toddler-cars";
import { SPEECH_AUDIO_PATHS } from "../../app/lib/speech";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*posthog\.(com|us|eu)\//, route => route.abort());
  const profiles = restoreProfiles(null);
  profiles.settings.luke.enabledGames = ["cars", ...TODDLER_CAR_GAMES];
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
const game = (page: Page) => page.getByTestId("toddler-game");
async function open(page: Page, type: ToddlerCarGame) {
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-luke").click();
  await menu.getByTestId("quick-games").click();
  await page.getByTestId(`quick-game-${type}`).click();
  await expect(game(page)).toHaveAttribute("data-game", type);
}
async function target(page: Page, type: ToddlerCarGame) {
  if (type === "car-hide") {
    await expect(game(page)).toHaveAttribute("data-phase", "watch");
    const garage = page.locator(".toddler-garage").filter({ has: page.getByTestId("hiding-car") });
    const id = await garage.getAttribute("data-testid");
    await expect(garage).toBeDisabled();
    await expect(game(page)).toHaveAttribute("data-phase", "choose");
    await expect(page.getByTestId("hiding-car")).toHaveCount(0);
    return page.getByTestId(id!);
  }
  const prompt = await page.locator("#toddler-title").innerText();
  const item = [...VEHICLES, ...PARTS].find(item => item.prompt === prompt)!;
  return page.getByTestId(`toddler-choice-${item.id}`);
}
async function solve(page: Page, type: ToddlerCarGame) {
  for (let round = 0; round < TODDLER_ROUNDS; round++) {
    await expect(game(page)).toHaveAttribute("data-round", String(round));
    await (await target(page, type)).click();
    await expect(game(page)).toHaveAttribute("data-phase", "success");
  }
  await expect(game(page)).toHaveCount(0);
}

for (const type of TODDLER_CAR_GAMES) {
  test(`iPad classic: ${type} offers ${type === "car-hide" ? "three" : "two"} large choices, clear voice, hints and automatic completion`, async ({ page }, testInfo) => {
    await open(page, type);
    let correct = await target(page, type);
    for (const picture of await game(page).locator("img").all()) {
      await expect.poll(() => picture.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await expect(picture).toHaveAttribute("draggable", "false");
    }
    await expect(page.locator(".toddler-choices > button")).toHaveCount(type === "car-hide" ? 3 : 2);
    for (const choice of await page.locator(".toddler-choices > button").all()) {
      const rect = (await choice.boundingBox())!;
      // Three garages share a phone row, so each is a little narrower than a two-choice card but still a comfortable toddler target.
      expect(rect.width).toBeGreaterThan(type === "car-hide" ? 110 : 130);
      expect(rect.height).toBeGreaterThanOrEqual(130);
      await expect(choice).toHaveCSS("user-select", "none");
    }
    if (type === "car-hide") {
      await page.getByRole("button", { name: "Показать ещё раз" }).click();
      correct = await target(page, type);
    } else await page.getByRole("button", { name: "Повторить задание голосом" }).click();
    const prompt = type === "car-hide" ? HIDE_FIND : await page.locator("#toddler-title").innerText();
    await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-voice-path", SPEECH_AUDIO_PATHS[prompt]);
    await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-played-voice", SPEECH_AUDIO_PATHS[prompt]);
    await expect.poll(() => page.locator("#game-voice-audio").evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThanOrEqual(2);
    const id = await correct.getAttribute("data-testid");
    const wrong = page.locator(`.toddler-choices > button:not([data-testid="${id}"])`);
    await wrong.first().click();
    await expect(correct).toHaveAttribute("data-hint", "true");
    await expect(game(page)).toHaveAttribute("data-round", "0");
    await expect(game(page)).toHaveAttribute("data-phase", "choose");
    await page.screenshot({ path: testInfo.outputPath(`${type}.png`) });
    await correct.click();
    await correct.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await expect(game(page)).toHaveAttribute("data-round", "0");
    for (let round = 1; round < TODDLER_ROUNDS; round++) {
      await expect(game(page)).toHaveAttribute("data-round", String(round));
      const next = await target(page, type);
      await page.screenshot({ path: testInfo.outputPath(`${type}-round-${round}.png`) });
      await next.click();
    }
    await expect(game(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Продолжить мультик" })).toHaveCount(0);
  });

  test(`iPad classic: ${type} pauses and resumes actual video on the final answer`, async ({ page }) => {
    test.setTimeout(90_000);
    const profiles = restoreProfiles(null);
    profiles.settings.luke.enabledGames = [type];
    profiles.settings.luke.intervalMinutes = 3 / 60;
    await installProfileSettingsFixture(page, profiles);
    await page.goto("/");
    const menu = page.getByTestId("pause-catalog");
    await menu.getByTestId("profile-luke").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mira-luke-profiles-v1") || "{}").settings?.luke?.enabledGames)).toEqual([type]);
    await menu.locator(".kids-video-card").first().click();
    const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
    await expect(game(page)).toHaveAttribute("data-game", type, { timeout: 20_000 });
    await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-played-voice", /\/audio\/ru-jessica-v1\/toddler\//);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    await solve(page, type);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
    const time = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(time + .5);
  });
}

for (const type of TODDLER_CAR_GAMES) {
  // Session thr_shrdda8h8y: Luke presses a picture and slides his finger, which never produces a click on iOS.
  // The answer must be taken from the very first touch, before the finger moves anywhere.
  test(`iPad classic: ${type} accepts a touch that slides off the picture`, async ({ page }) => {
    await open(page, type);
    const correct = await target(page, type);
    await expect(correct).toHaveCSS("touch-action", "none");
    const rect = (await correct.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 90, rect.y + rect.height + 120, { steps: 6 });
    await page.mouse.up();
    await expect(game(page)).toHaveAttribute("data-phase", "success");
    await expect(game(page)).toHaveAttribute("data-round", "1");
  });
}

test("iPad classic: toddler games stay in Luke, fit rotation and respect sound off", async ({ page }, testInfo) => {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.soundEnabled = false;
  profiles.settings.luke.enabledGames = [...TODDLER_CAR_GAMES];
  await installProfileSettingsFixture(page, profiles);
  for (const type of TODDLER_CAR_GAMES) {
    await open(page, type);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      const geometry = await game(page).evaluate(el => ({ width: el.scrollWidth, clientWidth: el.clientWidth, height: el.scrollHeight, clientHeight: el.clientHeight }));
      expect(geometry.width).toBeLessThanOrEqual(geometry.clientWidth);
      expect(geometry.height).toBeLessThanOrEqual(geometry.clientHeight);
      await page.screenshot({ path: testInfo.outputPath(`${type}-${viewport.width}.png`) });
    }
    expect(await page.locator("#game-voice-audio").count()).toBe(0);
    await page.getByRole("button", { name: "Закрыть игру" }).click();
    await expect(game(page)).toHaveCount(0);
  }
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-mira").click();
  await menu.getByRole("button", { name: "Для взрослых", exact: true }).click();
  for (const type of TODDLER_CAR_GAMES) await expect(page.getByTestId(`test-game-${type}`)).toHaveCount(0);
});
