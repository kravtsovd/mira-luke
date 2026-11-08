import { expect, test } from "@playwright/test";
import { CAR_PEOPLE_ROUNDS } from "../../app/lib/car-people";

const WRONG_WORDS = ["", "Одна машинка", "Две машинки", "Три машинки"];
const PRAISE = ["", "Один ребёнок - одна машинка", "Два ребёнка - две машинки", "Три ребёнка - три машинки"];

// The two rounds are a random pair of counts in a random order, so the test reads the number of children from data-round each step.
async function currentCount(page: import("@playwright/test").Page) {
  const game = page.getByTestId("car-people-game");
  await expect(game).toHaveAttribute("data-round", /^[123]$/);
  return Number(await game.getAttribute("data-round"));
}

test("Luke matches two groups of people with the same number of cars, then the game closes", async ({ page }) => {
  await page.goto("/games/car-people");
  const game = page.getByTestId("car-people-game");
  const played: number[] = [];
  for (let step = 1; step <= CAR_PEOPLE_ROUNDS; step++) {
    await expect(game).toHaveAttribute("data-step", String(step));
    const count = await currentCount(page);
    played.push(count);
    await expect(page.getByTestId("people-group").locator(".car-people-person")).toHaveCount(count);

    const wrong = count === 1 ? 2 : 1;
    await page.getByTestId(`cars-${wrong}`).click();
    await expect(page.getByRole("status")).toContainText(WRONG_WORDS[wrong]);
    await expect(game).toHaveAttribute("data-round", String(count));
    await page.getByTestId(`cars-${count}`).click();
    await expect(page.getByRole("status")).toContainText(PRAISE[count]);
  }
  expect(played).toHaveLength(2);
  expect(new Set(played).size).toBe(2);
  await expect(page).toHaveURL(/\/$/);
});

test("a touch drag of the matching cars finishes the first round", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "touch", "Touch input only");
  await page.goto("/games/car-people");
  const count = await currentCount(page);
  const from = (await page.getByTestId(`cars-${count}`).boundingBox())!;
  const to = (await page.getByTestId("people-group").boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 12; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
      x: start.x + (end.x - start.x) * step / 12,
      y: start.y + (end.y - start.y) * step / 12,
    }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("status")).toContainText(PRAISE[count]);
});
