import { expect, Page, test } from "@playwright/test";
import { ANIMALS, LUKE_TAP_GAMES, LukeTapGame, SAME_PROMPT, SIZES } from "../../app/lib/luke-tap-games";
import { MATCH_PICTURES, SIZE_PICTURES } from "../../app/lib/luke-pictures";
import { LUKE_TASKS_PER_GAME } from "../../app/lib/luke-tasks";
import { SPEECH_AUDIO_PATHS } from "../../app/lib/speech";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

// Session thr_84z7x9rkr7: Luke's animal, big/small and same-car games. Two tasks, two pictures, answer on touch.
test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*posthog\.(com|us|eu)\//, route => route.abort());
  const profiles = restoreProfiles(null);
  profiles.settings.luke.enabledGames = ["cars", ...LUKE_TAP_GAMES];
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
async function open(page: Page, type: LukeTapGame) {
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-luke").click();
  await menu.getByTestId("quick-games").click();
  await page.getByTestId(`quick-game-${type}`).click();
  await expect(game(page)).toHaveAttribute("data-game", type);
}
// The right picture is read from the task: the spoken prompt names the animal or the size; the same-car
// game shows its sample above the choices.
async function target(page: Page, type: LukeTapGame) {
  const prompt = await page.locator("#toddler-title").innerText();
  if (type === "same-car") {
    expect(prompt).toBe(SAME_PROMPT);
    const vehicle = await page.getByTestId("toddler-sample").getAttribute("data-item");
    return page.getByTestId(`toddler-choice-${vehicle}`);
  }
  const item = type === "big-small" ? SIZES.find(size => SIZE_PICTURES.some(picture => picture[size.id] === prompt))! : ANIMALS.find(animal => animal.prompt === prompt)!;
  expect(item, prompt).toBeTruthy();
  return page.getByTestId(`toddler-choice-${item.id}`);
}

for (const type of LUKE_TAP_GAMES) {
  test(`iPad classic: ${type} offers two large pictures, voice, hints and finishes after two tasks`, async ({ page }, testInfo) => {
    await open(page, type);
    const correct = await target(page, type);
    for (const picture of await game(page).locator("img").all()) {
      await expect.poll(() => picture.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      await expect(picture).toHaveAttribute("draggable", "false");
    }
    await expect(page.locator(".toddler-choices > button")).toHaveCount(2);
    await expect(page.locator(".toddler-progress > span")).toHaveCount(LUKE_TASKS_PER_GAME);
    for (const choice of await page.locator(".toddler-choices > button").all()) {
      const rect = (await choice.boundingBox())!;
      expect(rect.width).toBeGreaterThan(130);
      expect(rect.height).toBeGreaterThanOrEqual(130);
      await expect(choice).toHaveCSS("user-select", "none");
      await expect(choice).toHaveCSS("touch-action", "none");
    }
    if (type === "big-small") {
      // Same vehicle twice; the small one is visibly smaller.
      const big = (await page.getByTestId("toddler-choice-big").locator("img").boundingBox())!;
      const small = (await page.getByTestId("toddler-choice-small").locator("img").boundingBox())!;
      expect(small.width).toBeLessThan(big.width * 0.55);
    }
    await page.getByRole("button", { name: "Повторить задание голосом" }).click();
    const prompt = await page.locator("#toddler-title").innerText();
    await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-voice-path", SPEECH_AUDIO_PATHS[prompt]);
    await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-played-voice", SPEECH_AUDIO_PATHS[prompt]);
    const id = await correct.getAttribute("data-testid");
    const wrong = page.locator(`.toddler-choices > button:not([data-testid="${id}"])`);
    await wrong.first().click();
    await expect(correct).toHaveAttribute("data-hint", "true");
    await expect(game(page)).toHaveAttribute("data-round", "0");
    await expect(game(page)).toHaveAttribute("data-phase", "choose");
    if (type === "same-car") {
      const item = MATCH_PICTURES.find(p => p.id === id?.replace("toddler-choice-", ""))!;
      await expect(page.locator("#toddler-title")).toHaveText(item.hint);
      await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-played-voice", SPEECH_AUDIO_PATHS[item.hint]);
    }
    await page.screenshot({ path: testInfo.outputPath(`${type}.png`) });
    await correct.click();
    await expect(game(page)).toHaveAttribute("data-phase", "success");
    if (type === "animal-voices") {
      // The animal answers with its name and its sound.
      const animal = ANIMALS.find(a => a.prompt === prompt)!;
      await expect(page.locator("#toddler-title")).toHaveText(animal.sound);
      await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-voice-path", SPEECH_AUDIO_PATHS[animal.sound]);
    }
    if (type === "same-car") {
      const item = MATCH_PICTURES.find(p => p.id === id?.replace("toddler-choice-", ""))!;
      await expect(page.locator("#toddler-title")).toHaveText(item.praise);
      await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-played-voice", SPEECH_AUDIO_PATHS[item.praise]);
    }
    await correct.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await expect(game(page)).toHaveAttribute("data-round", "0");
    for (let round = 1; round < LUKE_TASKS_PER_GAME; round++) {
      await expect(game(page)).toHaveAttribute("data-round", String(round));
      const next = await target(page, type);
      await page.screenshot({ path: testInfo.outputPath(`${type}-round-${round}.png`) });
      await next.click();
    }
    await expect(game(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Продолжить мультик" })).toHaveCount(0);
  });

  // Session thr_shrdda8h8y: Luke presses a picture and slides his finger, which never produces a click on iOS.
  test(`iPad classic: ${type} accepts a touch that slides off the picture`, async ({ page }) => {
    await open(page, type);
    const correct = await target(page, type);
    const rect = (await correct.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 90, rect.y + rect.height + 120, { steps: 6 });
    await page.mouse.up();
    await expect(game(page)).toHaveAttribute("data-phase", "success");
    await expect(game(page)).toHaveAttribute("data-round", "1");
  });
}

test("iPad classic: the tap games stay in Luke, fit rotation and respect sound off", async ({ page }, testInfo) => {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.soundEnabled = false;
  profiles.settings.luke.enabledGames = [...LUKE_TAP_GAMES];
  await installProfileSettingsFixture(page, profiles);
  for (const type of LUKE_TAP_GAMES) {
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
  for (const type of LUKE_TAP_GAMES) await expect(page.getByTestId(`test-game-${type}`)).toHaveCount(0);
});

test("iPad classic: matching names the picture after waiting and after success with sound off", async ({ page }) => {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.soundEnabled = false;
  profiles.settings.luke.enabledGames = [...LUKE_TAP_GAMES];
  await installProfileSettingsFixture(page, profiles);
  await open(page, "same-car");
  const id = await page.getByTestId("toddler-sample").getAttribute("data-item");
  const item = MATCH_PICTURES.find(p => p.id === id)!;
  await expect(page.locator("#toddler-title")).toHaveText(SAME_PROMPT);
  await expect(page.locator("#toddler-title")).toHaveText(item.hint, { timeout: 12000 });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const geometry = await game(page).evaluate(el => ({ width: el.scrollWidth, clientWidth: el.clientWidth, height: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.clientHeight);
  }
  await page.getByTestId(`toddler-choice-${id}`).click();
  await expect(page.locator("#toddler-title")).toHaveText(item.praise);
  await expect(page.locator("#game-voice-audio")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть игру" }).click();
  await expect(game(page)).toHaveCount(0);
});
