import { expect, Page, test, TestInfo } from "@playwright/test";
import { restoreProfiles } from "../../app/lib/profiles";
import { installProfileSettingsFixture } from "./helpers/profile-settings";

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/[^/]*posthog\.(com|us|eu)\//, route => route.abort());
  const profiles = restoreProfiles(null);
  // Two games keep the launcher a picker: with one enabled it starts that game straight away.
  profiles.settings.luke.enabledGames = ["cars", "luke-count"];
  await installProfileSettingsFixture(page, profiles);
});

const game = (page: Page) => page.getByTestId("luke-count-game");
/** Which two of the three counts are on the board is random per game; both rows hold the same two. */
async function board(page: Page) {
  const lukes = page.locator('[data-row="lukes"] [data-testid^="lukes-"]');
  await expect(lukes).toHaveCount(2);
  await expect(page.locator('[data-row="cars"] [data-testid^="cars-"]')).toHaveCount(2);
  const onBoard = (await lukes.evaluateAll(nodes => nodes.map(node => Number((node as HTMLElement).dataset.count)))) as number[];
  return { first: onBoard[0], spare: onBoard[1] };
}

async function open(page: Page) {
  await page.goto("/");
  const menu = page.getByTestId("pause-catalog");
  await menu.getByTestId("profile-luke").click();
  await menu.getByTestId("quick-games").click();
  await page.getByTestId("quick-game-luke-count").click();
  await expect(game(page)).toBeVisible();
}

async function dragTo(page: Page, testInfo: TestInfo, count: number, target: { x: number; y: number }) {
  const from = (await page.getByTestId(`lukes-${count}`).boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  if (testInfo.project.name === "touch") {
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [target] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
  }
}

test("iPad classic: roomy car cards accept drops in opposite corners", async ({ page }, testInfo) => {
  await open(page);
  const { first, spare } = await board(page);
  const row = (await page.locator('[data-row="cars"]').boundingBox())!;
  const source = (await page.getByTestId(`lukes-${first}`).boundingBox())!;
  const firstCar = (await page.getByTestId(`cars-${first}`).boundingBox())!;
  expect(firstCar.width).toBeGreaterThan(source.width * 1.4);
  expect(firstCar.height).toBeGreaterThanOrEqual(140);
  expect(row.x + row.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("roomy-car-cards.png") });
  await dragTo(page, testInfo, first, { x: firstCar.x + 10, y: firstCar.y + 10 });
  await expect(page.getByTestId(`cars-${first}`)).toHaveAttribute("data-matched", "true");
  const secondCar = (await page.getByTestId(`cars-${spare}`).boundingBox())!;
  await dragTo(page, testInfo, spare, { x: secondCar.x + secondCar.width - 10, y: secondCar.y + secondCar.height - 10 });
  await expect(page.getByTestId(`cars-${spare}`)).toHaveAttribute("data-matched", "true");
});

test("iPad classic: a near miss lands on the closest car group but a distant drop does nothing", async ({ page }, testInfo) => {
  await open(page);
  const { first, spare } = await board(page);
  const cars = page.getByTestId(`cars-${first}`);
  const to = (await cars.boundingBox())!;
  const x = to.x + to.width / 2;
  await dragTo(page, testInfo, first, { x, y: to.y - 40 });
  await expect(cars).toHaveAttribute("data-matched", "false");
  await expect(page.getByTestId(`lukes-${first}`)).toBeEnabled();
  await dragTo(page, testInfo, spare, { x, y: to.y - 20 });
  await expect(cars).toHaveAttribute("data-wrong", "true");
  await expect(cars).toHaveAttribute("data-matched", "false");
  // Let the wrong-answer shake finish before measuring the target again.
  await expect.poll(() => cars.evaluate(node => node.getAnimations().length)).toBe(0);
  const settled = (await cars.boundingBox())!;
  await dragTo(page, testInfo, first, { x: settled.x + settled.width / 2, y: settled.y - 20 });
  await expect(cars).toHaveAttribute("data-matched", "true");
  await expect(page.getByTestId(`cars-${spare}`)).toHaveAttribute("data-matched", "false");
});

// Titled for the tablet-webkit project, which selects tests by name: the kids play on an iPad, so WebKit is the
// device that actually matters for this gesture.
test("iPad classic: a finger drags the boys into the cars", async ({ page }, testInfo) => {
  await open(page);
  const { first, spare } = await board(page);
  const boys = page.getByTestId(`lukes-${first}`);
  const cars = page.getByTestId(`cars-${first}`);

  // kids.css gives every button `touch-action: manipulation`, which hands the gesture to the browser and kills the
  // drag on touch while leaving it working with a mouse. This assertion is the guard against that coming back.
  await expect(boys).toHaveCSS("touch-action", "none");

  const from = (await boys.boundingBox())!;
  const to = (await cars.boundingBox())!;
  const touch = testInfo.project.name === "touch" ? await page.context().newCDPSession(page) : null;
  const point = (box: typeof from) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

  const start = async () => {
    const { x, y } = point(from);
    if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    else { await page.mouse.move(x, y); await page.mouse.down(); }
  };
  const move = async (x: number, y: number) => {
    if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    else await page.mouse.move(x, y, { steps: 12 });
  };
  const end = async (x: number, y: number) => {
    if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else { await page.mouse.move(x, y); await page.mouse.up(); }
  };

  await start();
  await move(point(to).x, point(to).y);
  await expect(page.locator(".luke-count-ghost")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("luke-count-drag.png") });
  await end(point(to).x, point(to).y);

  await expect(page.locator(".luke-count-ghost")).toHaveCount(0);
  await expect(cars).toHaveAttribute("data-matched", "true");
  await expect(cars.locator(".luke-count-rider .luke-boy")).toHaveCount(first);
  await expect(page.getByTestId(`cars-${spare}`).locator(".luke-boy")).toHaveCount(0);
  await expect(page.locator(".luke-count-row[data-row=\"cars\"] .luke-count-card")).toHaveCount(2);
});

test("a drag onto the wrong group is refused and the game stays playable", async ({ page }, testInfo) => {
  await open(page);
  const { first, spare } = await board(page);
  const from = (await page.getByTestId(`lukes-${first}`).boundingBox())!;
  const to = (await page.getByTestId(`cars-${spare}`).boundingBox())!;
  const touch = testInfo.project.name === "touch" ? await page.context().newCDPSession(page) : null;
  const target = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  if (touch) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [target] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
  }

  await expect(page.getByTestId(`cars-${spare}`)).toHaveAttribute("data-matched", "false");
  await expect(page.getByTestId(`lukes-${first}`)).toBeEnabled();
  await expect(game(page)).toBeVisible();
});
