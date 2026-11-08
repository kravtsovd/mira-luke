import { expect, test } from "@playwright/test";

async function touchDrag(page: import("@playwright/test").Page, from: string, to: string) {
  const source = (await page.getByTestId(from).boundingBox())!;
  const target = (await page.getByTestId(to).boundingBox())!;
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 12; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
      x: start.x + (end.x - start.x) * step / 12,
      y: start.y + (end.y - start.y) * step / 12,
    }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

for (const game of ["luke-count", "car-people"] as const) {
  test(`Luke can drag ${game} with a finger from the real app`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "touch", "Touch browser only");
    await page.route(/https:\/\/[^/]*posthog\.(com|us|eu)\//, route => route.abort());
    await page.goto("/");
    await page.getByTestId("pause-catalog").getByTestId("profile-luke").click();
    await page.getByTestId("pause-catalog").getByRole("button", { name: "Для взрослых", exact: true }).click();
    await page.getByTestId(`test-game-${game}`).click();

    // Both games open on a random count, so the dragged group is read from the game.
    let count: string;
    if (game === "car-people") {
      await expect(page.getByTestId("car-people-game")).toHaveAttribute("data-round", /^[123]$/);
      count = (await page.getByTestId("car-people-game").getAttribute("data-round"))!;
    } else {
      const lukes = page.locator('[data-row="lukes"] [data-testid^="lukes-"]').first();
      await expect(lukes).toBeVisible();
      count = (await lukes.getAttribute("data-count"))!;
    }
    const from = game === "luke-count" ? `lukes-${count}` : `cars-${count}`;
    const to = game === "luke-count" ? `cars-${count}` : "people-group";
    await expect(page.getByTestId(from)).toHaveCSS("touch-action", "none");
    await touchDrag(page, from, to);

    if (game === "luke-count") await expect(page.getByTestId(`lukes-${count}`)).toHaveAttribute("data-matched", "true");
    else await expect(page.getByTestId("car-people-game")).toHaveAttribute("data-phase", "success");
  });
}
