import { expect, Page, test } from "@playwright/test";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

test.beforeEach(async ({ page }) => { await installProfileSettingsFixture(page); });

const menu = (page: Page) => page.getByTestId("pause-catalog");
async function selectLuke(page: Page) {
  await page.goto("/");
  await menu(page).getByTestId("profile-luke").click();
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "luke");
}
async function openGame(page: Page) {
  await selectLuke(page);
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await page.getByTestId("test-game-cars").click();
  await expect(page.getByTestId("car-game")).toBeVisible();
  await page.getByRole("button", { name: "Повторить задание голосом" }).click();
  await expect(page.locator("#game-voice-audio")).toHaveAttribute("data-voice-path", "/audio/ru-jessica-v1/car-garages.mp3");
  await expect.poll(() => page.locator("#game-voice-audio").evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThanOrEqual(2);
}
/** The two colours waiting on the road this game; the third garage stands empty as a distractor. */
async function carsOnRoad(page: Page) {
  const cars = page.locator('[data-testid^="car-"]:not([data-testid="car-game"])');
  await expect(cars).toHaveCount(2);
  return (await cars.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")!.slice(4)))) as string[];
}
async function parkAll(page: Page) {
  for (const color of await carsOnRoad(page)) {
    await page.getByTestId(`car-${color}`).click();
    await page.getByTestId(`garage-${color}`).click();
  }
}

test("profiles preserve separate preferences across reload; cars belong only to Luke", async ({ page }) => {
  await selectLuke(page);
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки · Luke" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Игровые паузы" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("interval-5")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("interval-3").click();
  await page.getByTestId("sound-toggle").click();
  await page.getByTestId("menu-layout-grid").click();
  await page.getByTestId("save-settings").click();
  await expect(page.getByTestId("settings-dialog")).toHaveCount(0);
  await menu(page).getByTestId("profile-mira").click();
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Настройки · Mira" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Игровые паузы" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("test-game-cars")).toHaveCount(0);
  await expect(page.getByTestId("interval-10")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await menu(page).getByTestId("profile-luke").click();
  await page.reload();
  await expect(menu(page).getByTestId("profile-luke")).toHaveAttribute("aria-pressed", "true");
  await expect(menu(page)).toHaveAttribute("data-layout", "grid");
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("interval-3")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sound-toggle")).toHaveAttribute("aria-checked", "false");
});

const GARAGE_COLORS = ["red", "yellow", "green"];
const spareGarage = (cars: string[]) => GARAGE_COLORS.find(color => !cars.includes(color))!;

test("iPad classic: car game rejects a wrong garage and finishes only after both cars are parked", async ({ page }, testInfo) => {
  await openGame(page);
  await page.screenshot({ path: testInfo.outputPath("garage-start.png") });
  const cars = await carsOnRoad(page);
  await expect(page.locator("[data-garage]")).toHaveCount(3);
  await page.getByTestId(`car-${cars[0]}`).click();
  await page.getByTestId(`garage-${spareGarage(cars)}`).click();
  await expect(page.getByRole("status")).toContainText("Попробуй ещё раз");
  await expect(page.getByTestId(`car-${cars[0]}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Продолжить мультик" })).toHaveCount(0);
  await parkAll(page);
  await expect(page.getByTestId("car-game").locator('[data-parked="true"]')).toHaveCount(2);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect(menu(page)).toBeVisible();
});

test("iPad classic: car drag has no selection or duplicate, recovers and works after rotation", async ({ page }, testInfo) => {
  await openGame(page);
  const cars = await carsOnRoad(page);
  const car = page.getByTestId(`car-${cars[0]}`);
  const garage = page.getByTestId(`garage-${cars[0]}`);
  await expect(car).toHaveCSS("touch-action", "none");
  for (const target of [car.locator("span"), page.locator(".garage-label").first(), page.locator("#garage-title")]) {
    await expect(target).toHaveCSS("user-select", "none");
  }
  const from = (await car.boundingBox())!;
  const to = (await garage.boundingBox())!;
  const cdp = testInfo.project.name === "touch" ? await page.context().newCDPSession(page) : null;
  const start = async () => {
    const x = from.x + from.width / 2, y = from.y + from.height / 2;
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    else { await page.mouse.move(x, y); await page.mouse.down(); }
  };
  const move = async (x: number, y: number) => {
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    else await page.mouse.move(x, y, { steps: 12 });
    await expect(car).toHaveCSS("opacity", "0");
    await expect(page.locator(".car-drag-ghost")).toBeVisible();
    expect(await car.boundingBox()).toEqual(from);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  };
  const end = async () => {
    if (cdp) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
    await expect(page.locator(".car-drag-ghost")).toHaveCount(0);
  };
  const wrong = (await page.getByTestId(`garage-${spareGarage(cars)}`).boundingBox())!;
  await start();
  await move(wrong.x + wrong.width / 2, wrong.y + wrong.height / 2);
  await page.screenshot({ path: testInfo.outputPath("garage-drag.png") });
  await end();
  await expect(car).toHaveCSS("opacity", "1");
  await expect(garage).toHaveAttribute("data-parked", "false");
  await expect(page.getByRole("status")).toContainText("Попробуй ещё раз");
  if (cdp) {
    await start();
    await move(to.x + to.width / 2, to.y + to.height / 2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(car).toHaveCSS("opacity", "1");
    await expect(page.locator(".car-drag-ghost")).toHaveCount(0);
    await expect(garage).toHaveAttribute("data-parked", "false");
  }
  await start();
  await move(to.x + to.width / 2, to.y + to.height / 2);
  await end();
  await expect(garage).toHaveAttribute("data-parked", "true");
  await expect(car).toHaveCount(0);
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId(`car-${cars[1]}`)).toBeInViewport();
    await expect(page.getByTestId(`garage-${cars[1]}`)).toBeInViewport();
    const geometry = await page.getByTestId("car-game").evaluate(el => ({ width: el.scrollWidth, clientWidth: el.clientWidth, height: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.height).toBeLessThanOrEqual(geometry.clientHeight);
    await page.screenshot({ path: testInfo.outputPath(`garage-${viewport.width}.png`) });
  }
});

async function garageOnly(page: Page) {
  const profiles = restoreProfiles(null);
  profiles.settings.luke.enabledGames = ["cars"];
  await installProfileSettingsFixture(page, profiles);
}

test("Luke's five-minute break pauses real playback and resumes on completion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The five-minute real-time playback probe runs once on desktop.");
  test.setTimeout(360_000);
  await garageOnly(page);
  await selectLuke(page);
  await menu(page).locator(".kids-video-card").first().click();
  await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
  const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.readyState >= 2)).toBe(true);
  await page.waitForTimeout(295_000);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect(page.getByTestId("car-game")).toBeVisible();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await parkAll(page);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
});


test("iPad classic: three-second test interval persists and auto resumes after the final car", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await garageOnly(page);
  await selectLuke(page);
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await page.getByTestId("interval-test-3-seconds").click();
  await page.getByTestId("save-settings").click();
  await expect(page.getByTestId("settings-dialog")).toHaveCount(0);
  await page.reload();
  await menu(page).getByRole("button", { name: "Для взрослых", exact: true }).click();
  await expect(page.getByTestId("interval-test-3-seconds")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("three-second-setting.png") });
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await menu(page).locator(".kids-video-card").first().click();
  await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
  const video = page.frameLocator('iframe[src*="youtube.com/embed/"]').locator("video");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused && el.readyState >= 2)).toBe(true);
  await expect(page.getByTestId("car-game")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  const [firstCar, lastCar] = await carsOnRoad(page);
  await page.getByTestId(`car-${firstCar}`).click();
  await page.getByTestId(`garage-${firstCar}`).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  if (testInfo.project.name === "touch") {
    const from = (await page.getByTestId(`car-${lastCar}`).boundingBox())!;
    const to = (await page.getByTestId(`garage-${lastCar}`).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.getByTestId(`car-${lastCar}`).click();
    await page.getByTestId(`garage-${lastCar}`).click();
  }
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Продолжить мультик" })).toHaveCount(0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  const resumedAt = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(resumedAt + 1);
  await expect(page.getByTestId("car-game")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await parkAll(page);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await page.getByTestId("player-tap-pause").click();
  const currentId = new URL(page.url()).searchParams.get("video");
  await menu(page).locator(`.kids-video-card:not([data-testid="kids-video-${currentId}"])`).first().click();
  await expect.poll(() => new URL(page.url()).searchParams.get("video")).not.toBe(currentId);
  await expect(page.getByTestId("player-tap-pause")).toHaveAttribute("data-playing", "true");
  await expect(page.getByTestId("car-game")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await parkAll(page);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
});

test("iPad classic: compact launcher opens current profile games including Luke's toddler activities", async ({ page }, testInfo) => {
  const profiles = restoreProfiles(null);
  profiles.settings.mira.enabledGames = ["huntrix", "colors"];
  profiles.settings.luke.enabledGames = ["cars", "car-voices", "car-workshop", "car-hide"];
  await installProfileSettingsFixture(page, profiles);
  await page.goto("/");
  const launcher = menu(page).getByTestId("quick-games");
  await expect(launcher).toHaveAttribute("aria-haspopup", "dialog");
  const size = (await launcher.boundingBox())!;
  expect(size.width).toBe(44);
  expect(size.height).toBe(44);
  await launcher.click();
  const picker = page.getByRole("dialog", { name: "Игры Mira" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button")).toHaveCount(2);
  await expect(picker.getByText("Машинки и гаражи")).toHaveCount(0);
  const bounds = (await picker.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("quick-games-mira.png") });
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.click();
  await page.getByTestId("quick-game-colors").click();
  await expect(page.getByTestId("game-dialog")).toBeVisible();
  await expect(page.getByTestId("game-dialog").locator(".game-visual")).toHaveCount(0);
  await expect(page.getByTestId("game-dialog").locator(".color-swatch")).toHaveCount(3);
  await page.getByTestId("game-dialog").locator('[data-answer="correct"]').click();
  await expect(page.getByTestId("game-dialog")).toHaveCount(0);
  await menu(page).getByTestId("profile-luke").click();
  await page.screenshot({ path: testInfo.outputPath("quick-games-luke.png") });
  await launcher.click();
  await expect(page.getByRole("dialog", { name: "Игры Luke" }).getByRole("button")).toHaveCount(4);
  await page.getByTestId("quick-game-cars").click();
  await expect(page.getByTestId("car-game")).toBeVisible();
  await parkAll(page);
  await expect(page.getByTestId("car-game")).toHaveCount(0);
  await expect(menu(page)).toBeVisible();
});
