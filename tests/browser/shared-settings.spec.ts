import { expect, Page, test } from "@playwright/test";

test.skip(process.env.SHARED_SETTINGS_LIVE_TEST !== "1", "Explicit opt-in: exercises the real family database and restores the initial settings.");
const key = "mira-luke-profiles-v1";
const openSettings = (page: Page) => page.getByTestId("pause-catalog").getByRole("button", { name: "Для взрослых", exact: true }).click();

test("shared settings: two independent devices, conflict protection and offline retry", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  const a = await first.newPage(), b = await second.newPage();
  const baselineResponse = await first.request.get(`${baseURL}/api/profile-settings`, { timeout: 15000, headers: { "X-Game-Schema": "2" } });
  expect(baselineResponse.status()).toBe(200);
  const baseline = (await baselineResponse.json()).profiles;
  const initialMira = baseline.find((row: { profile: string }) => row.profile === "mira");
  const initialLuke = baseline.find((row: { profile: string }) => row.profile === "luke");
  try {
    for (const page of [a, b]) {
      const loaded = page.waitForResponse(r => r.url().endsWith("/api/profile-settings") && r.request().method() === "GET");
      await page.goto(baseURL!);
      expect((await loaded).status()).toBe(200);
      await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}').settings?.mira?.intervalMinutes, key)).toBe(initialMira.settings.intervalMinutes);
    }
    await b.getByTestId("pause-catalog").getByTestId("profile-luke").click();
    await openSettings(a);
    await a.getByTestId("interval-15").click();
    await a.getByTestId("menu-layout-grid").click();
    if (await a.getByTestId("sound-toggle").getAttribute("aria-checked") === "true") await a.getByTestId("sound-toggle").click();
    if (await a.getByTestId("game-toggle-letters").getAttribute("aria-pressed") === "false") await a.getByTestId("game-toggle-letters").click();
    if (await a.getByTestId("game-toggle-huntrix").getAttribute("aria-pressed") === "true") await a.getByTestId("game-toggle-huntrix").click();
    await a.getByTestId("save-settings").click();
    await expect(a.getByTestId("settings-dialog")).toHaveCount(0);
    const after = (await (await first.request.get(`${baseURL}/api/profile-settings`, { timeout: 15000, headers: { "X-Game-Schema": "2" } })).json()).profiles;
    expect(after.find((r: { profile: string }) => r.profile === "luke")).toEqual(initialLuke);
    const refreshed = b.waitForResponse(r => r.url().endsWith("/api/profile-settings") && r.request().method() === "GET");
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshed;
    await expect.poll(() => b.evaluate(k => JSON.parse(localStorage.getItem(k)!).settings.mira.intervalMinutes, key)).toBe(15);
    await expect(b.getByTestId("app-root")).toHaveAttribute("data-profile", "luke");
    await b.getByTestId("pause-catalog").getByTestId("profile-mira").click();
    await openSettings(b);
    await expect(b.getByTestId("interval-15")).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("menu-layout-grid")).toHaveAttribute("aria-checked", "true");
    await expect(b.getByTestId("sound-toggle")).toHaveAttribute("aria-checked", "false");
    await expect(b.getByTestId("game-toggle-letters")).toHaveAttribute("aria-pressed", "true");
    await expect(b.getByTestId("game-toggle-huntrix")).toHaveAttribute("aria-pressed", "false");

    // Keep B's editor open while A saves a newer interval.
    await openSettings(a);
    await a.getByTestId("interval-10").click();
    await a.getByTestId("save-settings").click();
    await expect(a.getByTestId("settings-dialog")).toHaveCount(0);
    await b.getByTestId("interval-3").click();
    await b.getByTestId("save-settings").click();
    await expect(b.getByText(/Настройки уже изменили на другом устройстве/)).toBeVisible();
    await expect(b.getByTestId("interval-10")).toHaveAttribute("aria-pressed", "true");

    await second.setOffline(true);
    await b.getByTestId("interval-5").click();
    await b.getByTestId("save-settings").click();
    await expect(b.getByText(/Не удалось сохранить на всех устройствах/)).toBeVisible();
    await expect(b.getByTestId("settings-dialog")).toBeVisible();
    await second.setOffline(false);
    await b.getByTestId("interval-10").click();
    await b.getByTestId("save-settings").click();
    await expect(b.getByTestId("settings-dialog")).toHaveCount(0);
    await b.reload();
    await openSettings(b);
    await expect(b.getByTestId("interval-10")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await second.setOffline(false);
    const latest = (await (await first.request.get(`${baseURL}/api/profile-settings`, { timeout: 15000, headers: { "X-Game-Schema": "2" } })).json()).profiles.find((r: { profile: string }) => r.profile === "mira");
    const restored = await first.request.put(`${baseURL}/api/profile-settings`, { headers: { origin: baseURL!, "X-Game-Schema": "2" }, data: { profile: "mira", settings: initialMira.settings, revision: latest.revision } });
    expect(restored.status()).toBe(200);
    expect((await restored.json()).saved.settings).toEqual(initialMira.settings);
    await first.close(); await second.close();
  }
});
