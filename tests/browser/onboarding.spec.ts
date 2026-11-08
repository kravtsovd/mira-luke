import { expect, test } from "@playwright/test";

test("a new family goes through children and the cartoons step", async ({ page }, testInfo) => {
  const rows: Record<string, unknown>[] = [];
  await page.route("**/api/auth/session", route => route.fulfill({ json: { signedIn: true, email: "new.mom@example.test", userName: "Анна", family: { id: "f-test", name: "Семья Анна" }, googleConfigured: true, youtubeImport: true } }));
  await page.route("**/api/profile-settings", route => route.fulfill({ json: { profiles: rows } }));
  await page.route("**/api/profiles", async route => {
    const body = route.request().postDataJSON();
    const row = { profile: "c-test00000001", name: body.name, avatar: body.avatar, kind: body.kind, revision: 1, settings: { menuLayout: "feed", learningEnabled: true, intervalMinutes: 10, soundEnabled: true, enabledGames: ["letters"] } };
    rows.push(row);
    await route.fulfill({ status: 201, json: { child: row } });
  });
  await page.route("**/api/family/agent-keys", route => route.fulfill({ json: { keys: [] } }));
  await page.route("**/api/family/reports", route => route.fulfill({ status: 200, json: { reports: [] } }));
  await page.goto("/?welcome=1");
  await expect(page.getByTestId("family-onboarding")).toBeVisible();
  await expect(page.getByText("Добро пожаловать! Кто будет смотреть?")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("onboarding-1-children.png") });
  await page.getByTestId("child-add").click();
  await page.getByTestId("child-name").fill("Маша");
  await page.getByTestId("child-create").click();
  await expect(page.getByTestId("welcome-library")).toBeVisible();
  await expect(page.getByTestId("welcome-youtube")).toHaveAttribute("href", "/api/youtube/connect");
  await page.screenshot({ path: testInfo.outputPath("onboarding-2-cartoons.png") });
  await page.getByTestId("welcome-catalog").click();
  await expect(page.getByTestId("welcome-library")).toHaveCount(0);
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-profile", "c-test00000001");
});
